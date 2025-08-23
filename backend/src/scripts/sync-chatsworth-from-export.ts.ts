/**
 * sync-chatsworth-from-export.ts
 *
 *  *   From
 *      /Users/tedshaffer/Documents/Projects/chatsworth/backend
 *          npx ts-node src/scripts/import-conversations-to-db.ts /Users/tedshaffer/Documents/Projects/chatgpt-export-parser/data/chatGPTExport-08-21-25-0/conversations-with-projects.json
 *          npx ts-node src/scripts/sync-chatsworth-from-export.ts \
 *            --full /Users/tedshaffer/Documents/Projects/chatgpt-export-parser/data/chatGPTExport-08-21-25-0/conversations-with-projects.json \
 *            --dry-run
 * 
 *            [--updated /abs/path/to/updated-<range>.json] \
 *            [--dry-run]
 * 
 * Behavior:
 * - Always CONNECTS to DB (even in --dry-run) to read current state.
 * - In --dry-run, NO WRITES are executed; all changes are computed & reported.
 * - Mirrors UI:
 *   - Upserts projects
 *   - Ensures each chat lives in the correct project (moves if needed)
 *   - Upserts entries by (chatId, position) from the VISIBLE BRANCH ONLY
 *   - PRUNES any DB entries not present in latest export (per chat)
 *   - DELETES chats absent from the full export (plus their entries)
 */

import dotenv from 'dotenv';
dotenv.config({
  path: path.resolve(__dirname, '../../.env')
});

import fs from "fs/promises";
import path from "path";
import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI not set");
  process.exit(1);
}

import { ProjectModel } from "../models/Project";     // adjust paths if needed
import { ChatEntryModel } from "../models/ChatEntry"; // adjust paths if needed

// ---------- Types from export ----------
type ProjectTag = { id: string; name?: string } | null;

type ExportMessage = {
  id?: string;
  author?: { role?: string | null } | null;
  create_time?: number | null;
  content?: { parts?: string[] } | null;
};

type ExportNode = {
  id?: string;
  parent?: string | null;
  children?: string[] | null;
  message?: ExportMessage | null;
  create_time?: number | string | null;
};

type ExportConversation = {
  id: string; // chatId
  title: string;
  mapping: Record<string, ExportNode>;
  create_time?: number | string | null;
  update_time?: number | string | null;
  current_node?: string | null;
  project: ProjectTag;
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
    const secs = v > 1e12 ? Math.floor(v / 1000) : v;
    return new Date(secs * 1000);
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function extractText(msg?: ExportMessage | null): string {
  if (!msg?.content?.parts) return "";
  return msg.content.parts.filter((p) => typeof p === "string").join("\n").trim();
}

function formatPromptLine(s?: string, max = 200): string {
  if (!s) return "(empty prompt)";
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? one.slice(0, max) + "…" : one;
}

function nodeTimestampSec(node?: ExportNode | null): number | undefined {
  if (!node) return undefined;
  const m = node.message;
  let raw: number | string | null | undefined = undefined;
  if (typeof m?.create_time === "number") raw = m.create_time;
  else raw = node.create_time;

  if (raw == null) return undefined;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (Number.isNaN(n)) return undefined;
  return n > 1e12 ? Math.floor(n / 1000) : n;
}

type FlatMsg = { t: number; role: "user" | "assistant"; text: string };

function visibleBranchMessages(conv: ExportConversation): FlatMsg[] {
  const map = conv.mapping || {};
  const tip = conv.current_node || "";

  if (tip && map[tip]) {
    const pathIds: string[] = [];
    let cur: string | null | undefined = tip;
    const guard = new Set<string>();
    while (cur && map[cur]) {
      if (guard.has(cur)) break;
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

  // Fallback: flatten everything
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

  let pos = 0;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role !== "user") continue;
    let j = i + 1;
    while (j < msgs.length && msgs[j].role !== "assistant") j++;
    if (j >= msgs.length) continue;

    const u = m, a = msgs[j];
    const prompt = u.text.trim();
    const response = a.text.trim();
    if (!prompt || !response) continue;

    const createdAt = isFinite(u.t) ? new Date(u.t * 1000) : undefined;
    const updatedAt = isFinite(a.t) ? new Date(a.t * 1000) : createdAt;
    const summary = prompt.split(/\n+/)[0].slice(0, 200);

    entries.push({
      filter: { chatId, position: pos },
      set: {
        projectId,
        originalPrompt: prompt,
        promptSummary: summary,
        response,
        updatedAt,
        exportedAt,
        source: "chatgpt-export",
      },
      setOnInsert: { chatId, position: pos, createdAt },
      position: pos,
    });

    pos++;
    i = j;
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

  // === 1) Projects upsert (simulate in dry-run using DB reads) ===
  const projectMap = new Map<string, string>();
  for (const conv of fullConvs) {
    const pid = conv.project?.id ?? "manual_unassigned";
    const pname = conv.project?.name ?? "Unassigned";
    projectMap.set(pid, pname);
  }
  const projectIds = Array.from(projectMap.keys());

  // Which projects already exist?
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
          $setOnInsert: { projectId, chats: [] as any[] },
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
    const keepPositions = new Set(pairs.map((p) => p.position));

    // Where does this chat currently live?
    const currentHomes = await ProjectModel.find(
      { "chats.chatId": chatId },
      { projectId: 1 },
    ).lean();

    const livesElsewhere = currentHomes.some((d) => d.projectId !== projectId);
    const homesElse = currentHomes.filter((d) => d.projectId !== projectId).map((d) => d.projectId);

    // Existing entry positions in DB
    const existingPositions = new Set<number>(
      (await ChatEntryModel.find({ chatId }, { position: 1, _id: 0 }).lean()).map((d: any) => d.position)
    );

    // Plan counts
    const toInsertPositions: number[] = [];
    for (const p of keepPositions) if (!existingPositions.has(p)) toInsertPositions.push(p);

    const toPrunePositions: number[] = [];
    for (const p of existingPositions) if (!keepPositions.has(p)) toPrunePositions.push(p);

    // Upsert count (attempts)
    entriesUpserts += pairs.length;
    entriesInserted += toInsertPositions.length;

    // Move chat if necessary
    if (livesElsewhere) {
      if (dryRun) {
        chatsMoved += homesElse.length; // approximate; each home will have a $pull
      } else {
        const res = await ProjectModel.updateMany(
          { "chats.chatId": chatId, projectId: { $ne: projectId } },
          { $pull: { chats: { chatId } } }
        );
        chatsMoved += res.modifiedCount || 0;

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

    // Upsert entries
    if (!dryRun) {
      const ops = pairs.map(({ filter, set, setOnInsert }) => ({
        updateOne: { filter, update: { $set: set, $setOnInsert: setOnInsert }, upsert: true },
      }));
      for (const batch of chunk(ops, 1000)) {
        const res: any = await ChatEntryModel.bulkWrite(batch, { ordered: false });
        entriesInserted += Number(res.upsertedCount || 0);
      }
    }

    // --- Prune entries not in the export (by position) & print their prompts
    if (toPrunePositions.length) {
      const pruneDocs = await ChatEntryModel.find(
        { chatId, position: { $in: toPrunePositions } },
        { position: 1, originalPrompt: 1, _id: 0 }
      )
        .sort({ position: 1 })
        .lean();

      console.log("    pruned entries:");
      for (const d of pruneDocs) {
        const prompt = (d as any).originalPrompt ?? "";
        const oneLine = prompt.replace(/\s+/g, " ").trim();
        const shown = oneLine.length > 200 ? oneLine.slice(0, 200) + "…" : oneLine;
        console.log(`    - [pos ${d.position}] ${shown || "(empty prompt)"}`);
      }

      if (!dryRun) {
        const delRes = await ChatEntryModel.deleteMany({
          chatId,
          position: { $in: toPrunePositions }, // delete exactly what we printed
        });
        entriesPruned += delRes.deletedCount || 0;
      } else {
        entriesPruned += pruneDocs.length;
      }
    }

    chatsProcessed++;
    console.log(
      `✔︎ ${projectName} :: ${title} — pairs:${pairs.length}` +
      (livesElsewhere ? `, move from [${homesElse.join(", ")}]` : "") +
      (toInsertPositions.length ? `, inserts:${toInsertPositions.length}` : "") +
      (toPrunePositions.length ? `, prune:${toPrunePositions.length}` : "")
    );
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
