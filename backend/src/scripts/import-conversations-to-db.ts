/**
 * Bulk importer optimized for your schema:
 *   - ProjectModel: { projectId, name, chats: [{ chatId, title, projectId, projectName, messageCount, metadata }] }
 *   - ChatEntryModel: { projectId, chatId, position, originalPrompt, promptSummary, response, createdAt, updatedAt, exportedAt, source, embedding? }
 *
 *   From
 *      /Users/tedshaffer/Documents/Projects/chatsworth/backend
 *          npx ts-node src/scripts/import-conversations-to-db.ts /Users/tedshaffer/Documents/Projects/chatgpt-export-parser/data/chatGPTExport-08-21-25-0/conversations-with-projects.json
 *
 * Notes:
 * - Idempotent: entries are upserted by (chatId, position); chats are refreshed via pull→push.
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

import { ProjectModel } from "../models/Project";     // adjust if your path differs
import { ChatEntryModel } from "../models/ChatEntry"; // adjust if your path differs

// ---------- Types from your export ----------
type ProjectTag = { id: string; name: string } | null;

type ExportMessage = {
  author?: { role?: string | null } | null;
  content?: { parts?: string[] } | null;
};

type ExportNode = {
  id?: string;
  parent?: string | null;
  children?: string[] | null;
  message?: ExportMessage | null;
  create_time?: number | string | null; // ChatGPT export often seconds
};

type ExportConversation = {
  id: string; // chatId
  title: string;
  mapping: Record<string, ExportNode>;
  create_time?: number | string | null;
  update_time?: number | string | null;
  project: ProjectTag; // injected by apply-project-map.ts
};

// ---------- Helpers ----------
function toDateOrNull(v: unknown): Date | null {
  if (v == null) return null;
  if (typeof v === "number") return new Date(v * 1000);
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function extractText(msg?: ExportMessage | null): string {
  if (!msg?.content?.parts) return "";
  return msg.content.parts.filter((p) => typeof p === "string").join("\n").trim();
}

type FlatMsg = { t: number; role: "user" | "assistant"; text: string };

function orderedMessages(mapping: Record<string, ExportNode>): FlatMsg[] {
  const out: FlatMsg[] = [];
  for (const node of Object.values(mapping)) {
    const role = node?.message?.author?.role;
    if (role !== "user" && role !== "assistant") continue;
    const text = extractText(node.message);
    if (!text) continue;

    // prefer numeric timestamp; unknown => +Infinity so it sorts last
    let t = Number.POSITIVE_INFINITY;
    if (typeof node.create_time === "number") t = node.create_time;
    else if (typeof node.create_time === "string") {
      const n = Number(node.create_time);
      if (!Number.isNaN(n)) t = n;
    }

    out.push({ t, role, text });
  }

  out.sort((a, b) => (a.t === b.t ? (a.role === b.role ? 0 : a.role === "user" ? -1 : 1) : a.t - b.t));
  return out;
}

function pairUserAssistant(
  msgs: FlatMsg[],
  projectId: string,
  chatId: string,
  exportedAt: Date
) {
  const entries: Array<{
    filter: { chatId: string; position: number };
    doc: {
      projectId: string;
      chatId: string;
      position: number;
      originalPrompt: string;
      promptSummary: string;
      response: string;
      createdAt?: Date;
      updatedAt?: Date;
      exportedAt: Date;
      source: string;
    };
    position: number;
  }> = [];

  // FIFO queue of unmatched user messages
  const userQueue: FlatMsg[] = [];
  let pos = 0;

  for (const m of msgs) {
    if (m.role === "user") {
      userQueue.push(m);
      continue;
    }
    if (m.role === "assistant") {
      const u = userQueue.shift(); // pair with earliest unmatched user
      if (!u) continue;

      const prompt = (u.text || "").trim();
      const response = (m.text || "").trim();
      if (!prompt || !response) continue;

      const createdAt = Number.isFinite(u.t) ? new Date(u.t * 1000) : undefined;
      const updatedAt = Number.isFinite(m.t) ? new Date(m.t * 1000) : createdAt;
      const promptSummary = prompt.split(/\n+/)[0].slice(0, 200);

      entries.push({
        filter: { chatId, position: pos },
        doc: {
          projectId,
          chatId,
          position: pos,
          originalPrompt: prompt,
          promptSummary,
          response,
          createdAt,
          updatedAt,
          exportedAt,
          source: "chatgpt-export",
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
  const convFile = process.argv[2];
  if (!convFile) {
    console.error("Usage: npx ts-node src/scripts/import-conversations-to-db.ts /path/to/conversations-with-projects.json");
    process.exit(1);
  }

  const abs = path.resolve(convFile);
  const raw = await fs.readFile(abs, "utf8");
  const conversations = JSON.parse(raw) as ExportConversation[];
  if (!Array.isArray(conversations)) throw new Error("conversations-with-projects.json must be an array");

  await mongoose.connect(MONGO_URI, { dbName: process.env.MONGO_DB_NAME || undefined });
  console.log(`✅ Connected to Mongo\nImporting from: ${abs}\nConversations: ${conversations.length}`);

  const now = new Date();

  // 1) Unique projects (projectId -> name)
  const projectMap = new Map<string, string>();
  for (const conv of conversations) {
    const pid = conv.project?.id ?? "manual_unassigned";
    const pname = conv.project?.name ?? "Unassigned";
    // last write wins if names conflict (shouldn't)
    projectMap.set(pid, pname);
  }

  // 2) Bulk upsert all projects
  const projectOps = Array.from(projectMap.entries()).map(([projectId, projectName]) => ({
    updateOne: {
      filter: { projectId },
      update: {
        $set: { name: projectName, lastSyncedAt: now },
        $setOnInsert: { projectId, chats: [] },
      },
      upsert: true,
    },
  }));

  let projectsCreated = 0;
  let projectsUpdated = 0;

  if (projectOps.length) {
    const projChunks = chunk(projectOps, 500); // keep chunks modest
    for (const ops of projChunks) {
      const res: any = await ProjectModel.bulkWrite(ops, { ordered: false });
      const up = Number(res.upsertedCount || 0);
      projectsCreated += up;
      projectsUpdated += ops.length - up;
    }
  }

  // 3) Prepare chat replacements (pull → push) and entry upserts
  type UpdateOne = { updateOne: { filter: any; update: any; upsert?: boolean } };
  const chatOps: UpdateOne[] = [];
  const entryOps: UpdateOne[] = [];

  for (const conv of conversations) {
    const chatId = conv.id;
    const projectId = conv.project?.id ?? "manual_unassigned";
    const projectName = conv.project?.name ?? "Unassigned";

    // messages & counts
    const msgs = orderedMessages(conv.mapping);
    const messageCount = msgs.length; // OR pair count if you prefer

    // Build chat meta
    const chatMeta = {
      chatId,
      title: conv.title || "(Untitled)",
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

    // Pull old subdoc, then push fresh one — order matters
    chatOps.push({
      updateOne: {
        filter: { projectId },
        update: { $pull: { chats: { chatId } } },
      },
    });
    chatOps.push({
      updateOne: {
        filter: { projectId },
        update: { $push: { chats: chatMeta } },
      },
    });

    // Entries (user→assistant pairs) — upsert by (chatId, position)
    const pairs = pairUserAssistant(msgs, projectId, chatId, now);
    for (const { filter, doc } of pairs) {
      entryOps.push({
        updateOne: {
          filter,
          update: { $setOnInsert: doc },
          upsert: true,
        },
      });
    }
  }

  const chatsUpserted = conversations.length;

  // 4) Execute chat bulk updates
  if (chatOps.length) {
    const chatChunks = chunk(chatOps, 1000);
    for (const ops of chatChunks) {
      await ProjectModel.bulkWrite(ops, { ordered: true }); // keep order so pull precedes push per chat
    }
  }

  // 5) Execute entry bulk upserts; count inserted precisely via upsertedCount
  let entriesInserted = 0;
  if (entryOps.length) {
    const entryChunks = chunk(entryOps, 1000);
    for (const ops of entryChunks) {
      const res: any = await ChatEntryModel.bulkWrite(ops, { ordered: false });
      entriesInserted += Number(res.upsertedCount || 0);
    }
  }

  // 6) Summary
  console.log("\n—— Import Summary ——");
  console.log(`Projects created:  ${projectsCreated}`);
  console.log(`Projects updated:  ${projectsUpdated}`);
  console.log(`Chats upserted:    ${chatsUpserted}`);
  console.log(`Entries inserted:  ${entriesInserted}`);

  await mongoose.disconnect();
  console.log("✅ Done.");
}

main().catch(async (err) => {
  console.error("❌ Import failed:", err);
  try { await mongoose.disconnect(); } catch { }
  process.exit(1);
});
