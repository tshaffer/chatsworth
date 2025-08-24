/**
 * sync-chatsworth-from-export.ts
 *
 * Authoritative, UI-accurate sync from ChatGPT export → Chatsworth DB.
 *
 *    From
 *     /Users/tedshaffer/Documents/Projects/chatsworth/backend
 *     npx ts-node src/scripts/sync-chatsworth-from-export.ts \
 *       --full /Users/tedshaffer/Documents/Projects/chatgpt-export-parser/data/chatGPTExport-08-21-25-0/conversations-with-projects.json \
 *       --dry-run
 * 
 *       [--updated /abs/path/to/updated-<range>.json] \
 *       [--dry-run]
 * 
 * Behavior:
 * - Always CONNECTS to DB (even in --dry-run) to read current state.
 * - In --dry-run, NO WRITES are executed; changes are computed & reported precisely.
 * - Mirrors UI:
 *   - Upserts projects
 *   - Ensures each chat lives in the correct project (moves if needed)
 *   - Pairs only the UI-visible branch (via current_node)
 *   - Upserts entries by identity (hash of prompt+response)
 *   - Repositions kept entries safely (two-phase update)
 *   - PRUNES DB entries not present in latest export (by identity)
 *   - DELETES chats absent from the full export (plus their entries)
 * - Extra logging:
 *   - New projects and project renames
 *   - Chat title renames
 *   - Each pruned prompt (position + snippet)
 */

import dotenv from 'dotenv';
dotenv.config({
  path: path.resolve(__dirname, '../../.env')
});

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI not set");
  process.exit(1);
}

// Adjust import paths if your model files live elsewhere
import { ProjectModel } from "../models/Project";
import { ChatEntryModel } from "../models/ChatEntry";

// ---------- Types from export ----------
type ProjectTag = { id: string; name?: string } | null;

type ExportMessage = {
  id?: string;
  author?: { role?: string | null } | null;
  create_time?: number | null; // seconds (usually)
  content?: { parts?: string[] } | null;
};

type ExportNode = {
  id?: string;
  parent?: string | null;
  children?: string[] | null;
  message?: ExportMessage | null;
  create_time?: number | string | null; // sometimes here too
};

type ExportConversation = {
  id: string; // chatId
  title: string;
  mapping: Record<string, ExportNode>;
  create_time?: number | string | null;
  update_time?: number | string | null;
  current_node?: string | null; // visible branch tip
  project: ProjectTag;          // injected by apply-project-map.ts
};

// ---------- CLI args ----------
function parseArgs(argv: string[]) {
  const args = { full: "", updated: "", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--full") args.full = argv[++i] || "";
    else if (a === "--updated") args.updated = argv[++i] || "";
    else if (a === "--dry-run") args.dryRun = true;
  }
  if (!args.full) {
    console.error(
      "Usage:\n  npx ts-node backend/src/scripts/sync-chatsworth-from-export.ts " +
      "--full /path/to/conversations-with-projects.json [--updated /path/to/updated-<range>.json] [--dry-run]"
    );
    process.exit(1);
  }
  return args;
}

// ---------- Helpers ----------
function toDateOrNull(v: unknown): Date | null {
  if (v == null) return null;
  if (typeof v === "number") {
    const secs = v > 1e12 ? Math.floor(v / 1000) : v; // normalize ms→s if needed
    return new Date(secs * 1000);
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function extractText(msg?: ExportMessage | null): string {
  if (!msg?.content?.parts) return "";
  return msg.content.parts.filter((p) => typeof p === "string").join("\n").trim();
}

/** Prefer message.create_time; fall back to node.create_time; normalize to seconds */
function nodeTimestampSec(node?: ExportNode | null): number | undefined {
  if (!node) return undefined;
  const m = node.message;
  let raw: number | string | null | undefined = undefined;
  if (m && typeof m.create_time === "number") raw = m.create_time;
  else raw = node.create_time;

  if (raw == null) return undefined;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (Number.isNaN(n)) return undefined;
  return n > 1e12 ? Math.floor(n / 1000) : n;
}

type FlatMsg = { t: number; role: "user" | "assistant"; text: string };

/** Walk current_node → root to get the UI-visible branch; fallback: flatten all */
function visibleBranchMessages(conv: ExportConversation): FlatMsg[] {
  const map = conv.mapping || {};
  const tip = conv.current_node || "";

  if (tip && map[tip]) {
    const pathIds: string[] = [];
    let cur: string | null | undefined = tip;
    const guard = new Set<string>();
    while (cur && map[cur]) {
      if (guard.has(cur)) break; // cycle guard
      guard.add(cur);
      pathIds.push(cur);
      cur = map[cur].parent || null;
    }
    pathIds.reverse();

    const out: FlatMsg[] = [];
    for (const id of pathIds) {
      const node = map[id];
      if (!node?.message) continue;
      const role = node.message.author?.role;
      if (role !== "user" && role !== "assistant") continue;
      const text = extractText(node.message);
      if (!text) continue;
      const t = nodeTimestampSec(node);
      out.push({ t: t ?? Number.POSITIVE_INFINITY, role, text });
    }
    out.sort((a, b) => (a.t === b.t ? (a.role === b.role ? 0 : a.role === "user" ? -1 : 1) : a.t - b.t));
    return out;
  }

  // Fallback: best-effort flatten over all nodes
  const out: FlatMsg[] = [];
  for (const node of Object.values(map)) {
    if (!node?.message) continue;
    const role = node.message.author?.role;
    if (role !== "user" && role !== "assistant") continue;
    const text = extractText(node.message);
    if (!text) continue;
    const t = nodeTimestampSec(node);
    out.push({ t: t ?? Number.POSITIVE_INFINITY, role, text });
  }
  out.sort((a, b) => (a.t === b.t ? (a.role === b.role ? 0 : a.role === "user" ? -1 : 1) : a.t - b.t));
  return out;
}

/** Make a stable identity for a pair (prompt+response) regardless of position */
const pairHash = (prompt: string, response: string) =>
  crypto.createHash("sha1").update(`${prompt}\n␟\n${response}`).digest("hex");

function formatPromptLine(s?: string, max = 200): string {
  if (!s) return "(empty prompt)";
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? one.slice(0, max) + "…" : one;
}

/** Queue-based pairing: pair each assistant with the earliest unmatched user */
function pairVisibleUserAssistant(
  msgs: FlatMsg[],
  projectId: string,
  chatId: string,
  exportedAt: Date
) {
  const entries: Array<{
    filter: { chatId: string; position: number };
    set: {
      projectId: string;
      originalPrompt: string;
      promptSummary: string;
      response: string;
      updatedAt?: Date;
      exportedAt: Date;
      source: string;
    };
    setOnInsert: {
      chatId: string;
      position: number;
      createdAt?: Date;
    };
    position: number;
  }> = [];

  const userQueue: FlatMsg[] = [];
  let pos = 0;

  for (const m of msgs) {
    if (m.role === "user") {
      userQueue.push(m);
      continue;
    }
    if (m.role === "assistant") {
      const u = userQueue.shift();
      if (!u) continue;

      const prompt = (u.text || "").trim();
      const response = (m.text || "").trim();
      if (!prompt || !response) continue;

      const createdAt = Number.isFinite(u.t) ? new Date(u.t * 1000) : undefined;
      const updatedAt = Number.isFinite(m.t) ? new Date(m.t * 1000) : createdAt;
      const promptSummary = prompt.split(/\n+/)[0].slice(0, 200);

      entries.push({
        filter: { chatId, position: pos },
        set: {
          projectId,
          originalPrompt: prompt,
          promptSummary: promptSummary,
          response,
          updatedAt,
          exportedAt,
          source: "chatgpt-export",
        },
        setOnInsert: {
          chatId,
          position: pos,
          createdAt,
        },
        position: pos,
      });

      pos++;
    }
  }

  return entries;
}

function chunk<T>(arr: T[], size = 1000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------- Main ----------
async function main() {
  const { full, updated, dryRun } = parseArgs(process.argv.slice(2));

  // Full export (truth)
  const fullPath = path.resolve(full);
  const fullConvs: ExportConversation[] = JSON.parse(await fs.readFile(fullPath, "utf8"));
  if (!Array.isArray(fullConvs)) throw new Error("Full export must be an array");

  // Optional updated limiter
  const updatedSet = new Set<string>();
  if (updated) {
    const up: ExportConversation[] = JSON.parse(await fs.readFile(path.resolve(updated), "utf8"));
    if (!Array.isArray(up)) throw new Error("--updated must be an array");
    for (const c of up) updatedSet.add(c.id);
  }

  await mongoose.connect(MONGO_URI, { dbName: process.env.MONGO_DB_NAME || undefined });
  console.log(`✅ Connected (mode: ${dryRun ? "DRY RUN" : "WRITE"})`);
  console.log(`• Full export: ${fullPath} (conversations: ${fullConvs.length})`);
  if (updated) console.log(`• Updated file: ${updated} (limit: ${updatedSet.size} chat(s))`);

  const now = new Date();

  // === 1) Projects upsert (and detect new/renamed) ===
  const projectMap = new Map<string, string>();
  for (const conv of fullConvs) {
    const pid = conv.project?.id ?? "manual_unassigned";
    const pname = conv.project?.name ?? "Unassigned";
    projectMap.set(pid, pname);
  }
  const projectIds = Array.from(projectMap.keys());

  // Detect new / renamed projects BEFORE upsert
  const existingProjectsArr = await ProjectModel.find({}, { projectId: 1, name: 1 }).lean();
  const existingProjects = new Map<string, string>(
    (existingProjectsArr as any[]).map((p) => [p.projectId as string, (p.name as string) || ""])
  );

  const newProjects: Array<{ projectId: string; name: string }> = [];
  const renamedProjects: Array<{ projectId: string; from: string; to: string }> = [];
  for (const [pid, pname] of projectMap.entries()) {
    const prev = existingProjects.get(pid);
    if (prev == null) newProjects.push({ projectId: pid, name: pname });
    else if ((prev || "") !== (pname || "")) renamedProjects.push({ projectId: pid, from: prev, to: pname });
  }

  if (newProjects.length) {
    console.log(`• New projects detected: ${newProjects.length}`);
    for (const p of newProjects) console.log(`    + [${p.projectId}] ${p.name}`);
  }
  if (renamedProjects.length) {
    console.log(`• Project renames detected: ${renamedProjects.length}`);
    for (const r of renamedProjects) console.log(`    ~ [${r.projectId}] "${r.from}" → "${r.to}"`);
  }

  // Which projects already exist? (for summary counts)
  const existingProjectIds = new Set<string>(
    await ProjectModel.distinct("projectId", { projectId: { $in: projectIds } })
  );
  const wouldCreate = projectIds.filter((id) => !existingProjectIds.has(id));
  const wouldUpdate = projectIds.filter((id) => existingProjectIds.has(id));

  let projectsCreated = 0;
  let projectsUpdated = 0;

  if (dryRun) {
    projectsCreated = wouldCreate.length;
    projectsUpdated = wouldUpdate.length;
  } else {
    const ops = projectIds.map((projectId) => ({
      updateOne: {
        filter: { projectId },
        update: {
          $set: { name: projectMap.get(projectId), lastSyncedAt: now },
          $setOnInsert: { projectId, chats: [] },
        },
        upsert: true,
      },
    }));
    for (const batch of chunk(ops, 500)) {
      const res: any = await ProjectModel.bulkWrite(batch, { ordered: false });
      const up = Number(res.upsertedCount || 0);
      projectsCreated += up;
      projectsUpdated += batch.length - up;
    }
  }

  // === 2) Authoritative deletion of chats missing from FULL export ===
  const fullChatIds = new Set<string>(fullConvs.map((c) => c.id));
  const dbChatIds: string[] = await ProjectModel.distinct("chats.chatId");
  const staleChatIds = dbChatIds.filter((id) => !fullChatIds.has(id));
  let chatsDeleted = 0;
  let entriesDeletedByChat = 0;

  if (staleChatIds.length) {
    if (dryRun) {
      entriesDeletedByChat = await ChatEntryModel.countDocuments({ chatId: { $in: staleChatIds } });
      chatsDeleted = staleChatIds.length;
    } else {
      const delEntries = await ChatEntryModel.deleteMany({ chatId: { $in: staleChatIds } });
      entriesDeletedByChat += delEntries.deletedCount || 0;

      await ProjectModel.updateMany(
        { "chats.chatId": { $in: staleChatIds } },
        { $pull: { chats: { chatId: { $in: staleChatIds } } } }
      );
      chatsDeleted = staleChatIds.length;
    }
  }

  // === 3) Process conversations (either all, or limited by --updated) ===
  const toProcess = updated ? fullConvs.filter((c) => updatedSet.has(c.id)) : fullConvs;

  let chatsProcessed = 0;
  let chatsMoved = 0;
  let entriesUpserts = 0;
  let entriesInserted = 0;
  let entriesPruned = 0;

  for (const conv of toProcess) {
    const chatId = conv.id;
    const projectId = conv.project?.id ?? "manual_unassigned";
    const projectName = conv.project?.name ?? "Unassigned";
    const title = conv.title || "(Untitled)";

    // UI-visible messages → pair into entries
    const msgs = visibleBranchMessages(conv);
    const pairs = pairVisibleUserAssistant(msgs, projectId, chatId, now);

    // Build identity hash for each new pair
    const pairsWithHash = pairs.map(p => ({
      ...p,
      hash: pairHash(p.set.originalPrompt || "", p.set.response || "")
    }));

    // Where does this chat currently live?
    const currentHomes = await ProjectModel.find(
      { "chats.chatId": chatId },
      { projectId: 1, "chats.$": 1 }
    ).lean();

    const livesElsewhere = currentHomes.some((d: any) => d.projectId !== projectId);
    const homesElse = currentHomes.filter((d: any) => d.projectId !== projectId).map((d: any) => d.projectId);

    // Detect chat title rename (compare to existing subdoc title if present)
    const existingChatCarrier = await ProjectModel.findOne(
      { "chats.chatId": chatId },
      { "chats.$": 1, projectId: 1 }
    ).lean();
    const oldTitle: string | undefined = (existingChatCarrier as any)?.chats?.[0]?.title;
    const renamedChat = !!(oldTitle && oldTitle !== title);

    // Load existing DB entries for this chat to diff by hash
    type ExistingDoc = { _id: any; position: number; originalPrompt?: string; response?: string };
    const existingDocs = await ChatEntryModel.find(
      { chatId },
      { _id: 1, position: 1, originalPrompt: 1, response: 1 }
    ).lean() as ExistingDoc[];

    const existingByHash = new Map<string, ExistingDoc>();
    for (const d of existingDocs) {
      const h = pairHash(d.originalPrompt || "", d.response || "");
      const prev = existingByHash.get(h);
      if (!prev || d.position < prev.position) existingByHash.set(h, d);
    }

    const keepHashes = new Set(pairsWithHash.map(p => p.hash));

    // PRUNE: anything in DB whose hash isn’t in the new export
    const pruneDocs = existingDocs.filter(d => {
      const h = pairHash(d.originalPrompt || "", d.response || "");
      return !keepHashes.has(h);
    });

    // Count inserts (hash not seen in DB)
    const insertDocs: any[] = [];
    for (let i = 0; i < pairsWithHash.length; i++) {
      const p = pairsWithHash[i];
      if (!existingByHash.has(p.hash)) {
        insertDocs.push({
          projectId,
          chatId,
          position: i,
          originalPrompt: p.set.originalPrompt,
          promptSummary: p.set.promptSummary,
          response: p.set.response,
          createdAt: p.setOnInsert.createdAt,
          updatedAt: p.set.updatedAt,
          exportedAt: now,
          source: "chatgpt-export",
        });
      }
    }

    // Headline per chat
    const headlineParts = [`pairs:${pairsWithHash.length}`];
    if (pruneDocs.length) headlineParts.push(`prune:${pruneDocs.length}`);
    if (insertDocs.length) headlineParts.push(`inserts:${insertDocs.length}`);
    if (livesElsewhere) headlineParts.push(`move from [${homesElse.join(", ")}]`);
    if (renamedChat) headlineParts.push("rename");
    if (pruneDocs.length || insertDocs.length || livesElsewhere || renamedChat) {
      console.log(`✔︎ ${projectName} :: ${title} — ${headlineParts.join(", ")}`);
      if (renamedChat) {
        console.log(`    renamed: "${oldTitle}" → "${title}"`);
      }
    }
    // Print each pruned prompt
    if (pruneDocs.length) {
      console.log("    pruned entries:");
      const sorted = [...pruneDocs].sort((a, b) => a.position - b.position);
      for (const d of sorted) {
        console.log(`    - [pos ${d.position}] ${formatPromptLine(d.originalPrompt)}`);
      }
    }

    // Move chat if necessary
    if (livesElsewhere) {
      if (dryRun) {
        chatsMoved += homesElse.length; // approx (each home gets a $pull)
      } else {
        const res = await ProjectModel.updateMany(
          { "chats.chatId": chatId, projectId: { $ne: projectId } },
          { $pull: { chats: { chatId } } }
        );
        const mc = (res as any).modifiedCount ?? (res as any).nModified ?? 0;
        chatsMoved += mc;

        // Ensure ChatEntry.projectId reflects the new home
        await ChatEntryModel.updateMany({ chatId, projectId: { $ne: projectId } }, { $set: { projectId } });
      }
    }

    // Replace chat subdoc in target project
    const chatMeta = {
      chatId,
      title,
      projectId,
      projectName,
      messageCount: msgs.length,
      metadata: {
        user: "",
        created: toDateOrNull(conv.create_time),
        updated: toDateOrNull(conv.update_time),
        exportedAt: now,
        source: "chatgpt-export",
      },
    };

    if (!dryRun) {
      await ProjectModel.updateOne({ projectId }, { $pull: { chats: { chatId } } });
      await ProjectModel.updateOne({ projectId }, { $push: { chats: chatMeta } });
    }

    // Execute PRUNE (by identity) + UPDATE/REPOSITION + INSERT
    if (!dryRun) {
      // 1) Delete pruned docs
      if (pruneDocs.length) {
        const delRes = await ChatEntryModel.deleteMany({ _id: { $in: pruneDocs.map(d => d._id) } });
        entriesPruned += delRes.deletedCount || 0;
      }

      // 2) Two-phase reposition/update for kept entries
      //    Phase A: set temp negative positions and update metadata
      const phaseAOps: any[] = [];
      //    Phase B: set final positions
      const phaseBOps: any[] = [];

      for (let i = 0; i < pairsWithHash.length; i++) {
        const p = pairsWithHash[i];
        const existing = existingByHash.get(p.hash);
        if (!existing) continue; // handled in inserts

        phaseAOps.push({
          updateOne: {
            filter: { _id: existing._id },
            update: {
              $set: {
                projectId,
                position: -1 - i, // temporary to avoid unique conflicts
                originalPrompt: p.set.originalPrompt,
                promptSummary: p.set.promptSummary,
                response: p.set.response,
                updatedAt: p.set.updatedAt,
                exportedAt: now,
                source: "chatgpt-export",
              },
            },
          },
        });

        phaseBOps.push({
          updateOne: {
            filter: { _id: existing._id },
            update: { $set: { position: i } },
          },
        });
      }

      if (phaseAOps.length) await ChatEntryModel.bulkWrite(phaseAOps, { ordered: false });
      if (insertDocs.length) {
        const res: any = await ChatEntryModel.insertMany(insertDocs, {
          ordered: false,
          rawResult: true, // <-- key bit
        });
        entriesInserted += res?.insertedCount ?? 0;
      }
      if (phaseBOps.length) await ChatEntryModel.bulkWrite(phaseBOps, { ordered: false });

      // Track upserts count for summary (approx = kept+inserted)
      entriesUpserts += pairsWithHash.length;
    } else {
      // DRY-RUN accounting
      entriesPruned += pruneDocs.length;
      entriesInserted += insertDocs.length;
      entriesUpserts += pairsWithHash.length;
    }

    chatsProcessed++;
  }

  // === Summary ===
  console.log("\n—— Sync Summary ——");
  console.log(`Mode:               ${dryRun ? "DRY RUN (no writes)" : "WRITE"}`);
  console.log(`Projects created:   ${projectsCreated}`);
  console.log(`Projects updated:   ${projectsUpdated}`);
  console.log(`Chats deleted*:     ${chatsDeleted}  (*absent from full export)`);
  console.log(`Entries deleted*:   ${entriesDeletedByChat}  (*due to chat deletions)`);
  console.log(`Chats processed:    ${chatsProcessed}`);
  console.log(`Chats moved:        ${chatsMoved}`);
  console.log(`Entry upserts:      ${entriesUpserts}`);
  console.log(`Entries inserted:   ${entriesInserted}`);
  console.log(`Entries pruned:     ${entriesPruned}`);

  await mongoose.disconnect();
  console.log("✅ Finished.");
}

main().catch(async (err) => {
  console.error("❌ Sync failed:", err);
  try { await mongoose.disconnect(); } catch { }
  process.exit(1);
});
