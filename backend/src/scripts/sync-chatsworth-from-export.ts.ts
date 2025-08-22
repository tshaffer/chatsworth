/**
 * sync-chatsworth-from-export.ts
 *
 * Authoritative, UI-accurate sync from ChatGPT export → Chatsworth DB.
 * - Uses FULL export (conversations-with-projects.json) to mirror truth:
 *   - Upserts projects
 *   - Ensures each chat is in the correct project (move if needed)
 *   - Upserts entries by (chatId, position) from the VISIBLE BRANCH ONLY
 *   - PRUNES any DB entries not present in latest export (per chat)
 *   - DELETES chats (and their entries) that no longer exist in the full export
 * - Optionally, pass an UPDATED flat file to limit which chats get reprocessed
 *   (deletions still come from the full export).
 *
 * Usage:
 *   MONGO_URI="mongodb://localhost:27017/chatsworth" \
 *   npx ts-node src/scripts/sync-chatsworth-from-export.ts \
 *     --full /abs/path/to/conversations-with-projects.json \
 *     [--updated /abs/path/to/updated-<range>.json] \
 *     [--dry-run]
 *
 * Env:
 *   MONGO_URI=...
 *   (optional) MONGO_DB_NAME=...
 */

import fs from "fs/promises";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI not set");
  process.exit(1);
}

import { ProjectModel } from "../models/Project";     // adjust if paths differ
import { ChatEntryModel } from "../models/ChatEntry"; // adjust if paths differ

// ---------------- Types from export ----------------
type ProjectTag = { id: string; name?: string } | null;

type ExportMessage = {
  id?: string;
  author?: { role?: string | null } | null;
  create_time?: number | null; // seconds (usually)
  update_time?: number | null;
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

// ---------------- CLI args ----------------
function parseArgs(argv: string[]) {
  const args = { full: "", updated: "", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--full") args.full = argv[++i] || "";
    else if (a === "--updated") args.updated = argv[++i] || "";
    else if (a === "--dry-run") args.dryRun = true;
  }
  if (!args.full) {
    console.error("Usage:\n  npx ts-node src/scripts/sync-chatsworth-from-export.ts --full /path/to/conversations-with-projects.json [--updated /path/to/updated-<range>.json] [--dry-run]");
    process.exit(1);
  }
  return args;
}

// ---------------- Helpers ----------------
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

/**
 * Returns timestamp in seconds (normalized). Prefers message.create_time, falls back to node.create_time.
 */
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

/**
 * Extracts the UI-visible branch based on current_node by walking parents to root.
 * Only messages on that branch are considered, in chronological order.
 * Falls back to a "best effort" chronological flatten if current_node is missing.
 */
function visibleBranchMessages(conv: ExportConversation): FlatMsg[] {
  const map = conv.mapping || {};
  const tip = conv.current_node || "";

  if (tip && map[tip]) {
    // Build path from root to tip
    const pathIds: string[] = [];
    let cur: string | null | undefined = tip;
    const guard = new Set<string>();
    while (cur && map[cur]) {
      if (guard.has(cur)) break; // cycle guard
      guard.add(cur);
      pathIds.push(cur);
      cur = map[cur].parent || null;
    }
    // Reverse to chronological (root → tip)
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
    // Ensure ordering by t as secondary safety
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

/**
 * Pair messages as user→assistant in sequence; returns upsert payloads.
 * Positions are 0..N-1 and represent *visible* pairs.
 */
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

    // find the next assistant after this user
    let j = i + 1;
    while (j < msgs.length && msgs[j].role !== "assistant") j++;
    if (j >= msgs.length) continue;

    const u = m;
    const a = msgs[j];

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
      setOnInsert: {
        chatId,
        position: pos,
        createdAt,
      },
      position: pos,
    });

    pos++;
    i = j; // jump to assistant index
  }

  return entries;
}

function chunk<T>(arr: T[], size = 1000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------------- Main ----------------
async function main() {
  const { full, updated, dryRun } = parseArgs(process.argv.slice(2));

  // Read full export (authoritative)
  const fullPath = path.resolve(full);
  const fullRaw = await fs.readFile(fullPath, "utf8");
  const fullConvs = JSON.parse(fullRaw) as ExportConversation[];
  if (!Array.isArray(fullConvs)) throw new Error("Full export must be an array of conversations");

  // Optional: read updated file to limit which chats to process
  const updatedSet = new Set<string>();
  if (updated) {
    const updPath = path.resolve(updated);
    const updRaw = await fs.readFile(updPath, "utf8");
    const updConvs = JSON.parse(updRaw) as ExportConversation[];
    if (!Array.isArray(updConvs)) throw new Error("--updated file must be an array");
    for (const c of updConvs) updatedSet.add(c.id);
  }

  if (!dryRun) {
    await mongoose.connect(MONGO_URI, { dbName: process.env.MONGO_DB_NAME || undefined });
  }
  console.log(`✅ Starting sync`);
  console.log(`• Full export: ${fullPath} (conversations: ${fullConvs.length})`);
  if (updated) console.log(`• Updated file: ${path.resolve(updated)} (limit to ${updatedSet.size} chats)`);
  if (dryRun) console.log("ℹ️ DRY RUN: no writes will be made.");

  const now = new Date();

  // === 1) Upsert all projects present in the FULL export ===
  const projectMap = new Map<string, string>(); // projectId -> name
  for (const conv of fullConvs) {
    const pid = conv.project?.id ?? "manual_unassigned";
    const pname = conv.project?.name ?? "Unassigned";
    projectMap.set(pid, pname);
  }

  let projectsCreated = 0;
  let projectsUpdated = 0;

  if (!dryRun && projectMap.size) {
    const ops = Array.from(projectMap.entries()).map(([projectId, name]) => ({
      updateOne: {
        filter: { projectId },
        update: {
          $set: { name, lastSyncedAt: now },
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

  // === 2) Authoritative deletion of chats that no longer exist in the FULL export ===
  // Get all chatIds in full export
  const fullChatIds = new Set<string>(fullConvs.map((c) => c.id));
  let chatsDeleted = 0;
  let entriesDeletedByChat = 0;

  if (!dryRun) {
    // Find chatIds currently in DB (via Project subdocs)
    const dbChatIds: string[] = await ProjectModel.distinct("chats.chatId");
    const staleChatIds = dbChatIds.filter((id) => !fullChatIds.has(id));
    if (staleChatIds.length) {
      // Delete entries
      const delEntries = await ChatEntryModel.deleteMany({ chatId: { $in: staleChatIds } });
      entriesDeletedByChat += delEntries.deletedCount || 0;

      // Pull chat subdocs
      await ProjectModel.updateMany(
        { "chats.chatId": { $in: staleChatIds } },
        { $pull: { chats: { chatId: { $in: staleChatIds } } } }
      );

      chatsDeleted += staleChatIds.length;
      console.log(`🧹 Deleted ${staleChatIds.length} chat(s) absent from full export (entries removed: ${entriesDeletedByChat}).`);
    }
  }

  // === 3) Process conversations (either all from full export, or only those in --updated) ===
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

    // Messages from the visible branch only
    const msgs = visibleBranchMessages(conv);
    const messageCount = msgs.length;
    const pairs = pairVisibleUserAssistant(msgs, projectId, chatId, now);

    // Move chat if currently attached to a different project
    if (!dryRun) {
      const moveRes = await ProjectModel.updateMany(
        { "chats.chatId": chatId, projectId: { $ne: projectId } },
        { $pull: { chats: { chatId } } }
      );
      if (moveRes.modifiedCount) chatsMoved += moveRes.modifiedCount;
    }

    // Replace chat subdoc in target project
    const chatMeta = {
      chatId,
      title,
      projectId,
      projectName,
      messageCount,
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

    // Ensure ChatEntry.projectId reflects target project (in case of move)
    if (!dryRun) {
      await ChatEntryModel.updateMany({ chatId, projectId: { $ne: projectId } }, { $set: { projectId } });
    }

    // Upsert entries by (chatId, position)
    if (pairs.length) {
      const ops = pairs.map(({ filter, set, setOnInsert }) => ({
        updateOne: { filter, update: { $set: set, $setOnInsert: setOnInsert }, upsert: true },
      }));
      if (!dryRun) {
        for (const batch of chunk(ops, 1000)) {
          const res: any = await ChatEntryModel.bulkWrite(batch, { ordered: false });
          entriesInserted += Number(res.upsertedCount || 0);
          entriesUpserts += batch.length;
        }
      } else {
        entriesUpserts += ops.length;
      }
    }

    // PRUNE: delete any DB entries for this chat whose position is NOT present in the new visible export
    if (!dryRun) {
      const keepPositions = pairs.map((p) => p.position);
      const delRes = await ChatEntryModel.deleteMany({
        chatId,
        position: { $nin: keepPositions },
      });
      entriesPruned += delRes.deletedCount || 0;
    }

    chatsProcessed++;
    console.log(`✔︎ ${projectName} :: ${title} — pairs:${pairs.length}${msgs.length !== pairs.length * 2 ? " (unpaired msgs ignored)" : ""}`);
  }

  // === 4) Summary ===
  console.log("\n—— Sync Summary ——");
  console.log(`Projects created:    ${projectsCreated}`);
  console.log(`Projects updated:    ${projectsUpdated}`);
  console.log(`Chats deleted:       ${chatsDeleted}`);
  console.log(`Entries deleted*:    ${entriesDeletedByChat}   (*due to chat deletions)`);
  console.log(`Chats processed:     ${chatsProcessed}`);
  console.log(`Chats moved:         ${chatsMoved}`);
  console.log(`Entry upserts:       ${entriesUpserts}`);
  console.log(`Entries inserted:    ${entriesInserted}`);
  console.log(`Entries pruned:      ${entriesPruned}`);

  if (!dryRun) {
    await mongoose.disconnect();
    console.log("✅ Done.");
  }
}

main().catch(async (err) => {
  console.error("❌ Sync failed:", err);
  try { await mongoose.disconnect(); } catch { }
  process.exit(1);
});
