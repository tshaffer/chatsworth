/**
 * Usage:
 *   From
 *      /Users/tedshaffer/Documents/Projects/chatsworth/backend
 *          npx ts-node src/scripts/import-conversations-to-db.ts /Users/tedshaffer/Documents/Projects/chatgpt-export-parser/data/chatGPTExport-08-21-25-0/conversations-with-projects.json
 *
 * 
 *    npx ts-node src/scripts/import-conversations-to-db.ts /abs/path/to/conversations-with-projects.json
 *
 * Env:
 *   MONGO_URI="mongodb://localhost:27017/chatsworth"   # or your Atlas URI
 *   # optional: MONGO_DB_NAME="chatsworth"
 *
 * Notes:
 * - Matches your schema:
 *   - ProjectModel: { projectId, name, chats: [{ chatId, title, projectId, projectName, messageCount, metadata }] }
 *   - ChatEntryModel: { projectId, chatId, position, originalPrompt, promptSummary, response, createdAt, updatedAt, exportedAt, source }
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

import { ProjectModel } from "../models/Project";     // adjust path if needed
import { ChatEntryModel } from "../models/ChatEntry"; // adjust path if needed

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
  create_time?: number | string | null; // ChatGPT export
};

type ExportConversation = {
  id: string;                       // chatId
  title: string;
  mapping: Record<string, ExportNode>;
  create_time?: number | string | null;
  update_time?: number | string | null;
  project: ProjectTag;              // injected by apply-project-map.ts
};

function toDateOrNull(v: unknown): Date | null {
  if (v == null) return null;
  if (typeof v === "number") return new Date(v * 1000); // export often uses epoch seconds
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

    // Prefer numeric timestamp; unknown => +Infinity so it sorts to the end
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
  }> = [];

  let pos = 0;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role !== "user") continue;

    // find the next assistant reply
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
      projectId,
      chatId,
      position: pos++,
      originalPrompt: prompt,
      promptSummary: summary,
      response,
      createdAt,
      updatedAt,
      exportedAt,
      source: "chatgpt-export",
    });

    i = j; // advance past the assistant
  }

  return entries;
}

async function main() {
  const convFile = process.argv[2];
  if (!convFile) {
    console.error("Usage: npx ts-node src/scripts/import-conversations-to-db.ts /path/to/conversations-with-projects.json");
    process.exit(1);
  }

  const abs = path.resolve(convFile);
  const raw = await fs.readFile(abs, "utf8");
  const conversations = JSON.parse(raw) as ExportConversation[];

  if (!Array.isArray(conversations)) {
    throw new Error("conversations-with-projects.json must be an array");
  }

  await mongoose.connect(MONGO_URI, { dbName: process.env.MONGO_DB_NAME || undefined });
  console.log(`✅ Connected to Mongo\nImporting from: ${abs}\nConversations: ${conversations.length}`);

  const now = new Date();

  let projectsCreated = 0;
  let projectsUpserted = 0;
  let chatsUpserted = 0;
  let entriesInserted = 0;

  for (const conv of conversations) {
    const chatId = conv.id;
    const projectId = conv.project?.id ?? "manual_unassigned";
    const projectName = conv.project?.name ?? "Unassigned";

    // Build flat message list & counts
    const msgs = orderedMessages(conv.mapping);
    const messageCount = msgs.length;

    // ---- Upsert project document
    const res = await ProjectModel.updateOne(
      { projectId },
      {
        $set: { name: projectName, lastSyncedAt: now },     // set always (insert or update)
        $setOnInsert: { projectId, chats: [] },             // only fields unique to insert
      },
      { upsert: true }
    );
    if (res.upsertedCount) projectsCreated++;
    else projectsUpserted++;

    // ---- Replace (pull/push) this chat subdoc to keep it single & fresh
    await ProjectModel.updateOne(
      { projectId },
      { $pull: { chats: { chatId } } }
    );

    const chatMeta = {
      chatId,
      title: conv.title || "(Untitled)",
      projectId,
      projectName,
      messageCount,
      metadata: {
        user: "", // unknown in export; leave blank or remove this key if you prefer
        created: toDateOrNull(conv.create_time),
        updated: toDateOrNull(conv.update_time),
        exportedAt: now,
        source: "chatgpt-export",
      },
    };

    await ProjectModel.updateOne(
      { projectId },
      { $push: { chats: chatMeta } }
    );
    chatsUpserted++;

    // ---- Build ChatEntry docs from pairs
    const entries = pairUserAssistant(msgs, projectId, chatId, now);
    if (entries.length === 0) continue;

    // Insert entries; tolerate reruns by ignoring duplicate key errors on (chatId, position)
    try {
      await ChatEntryModel.insertMany(entries, { ordered: false });
      entriesInserted += entries.length;
    } catch (err: any) {
      // Ignore E11000 dup errors so reruns don’t bomb; count successful inserts
      const msg = String(err?.message ?? "");
      if (!/E11000 duplicate key error/.test(msg)) {
        throw err;
      }
      // best-effort estimate: Atlas/Mongoose doesn't return insertedCount here; skip adjustment.
    }
  }

  console.log("\n—— Import Summary ——");
  console.log(`Projects created:  ${projectsCreated}`);
  console.log(`Projects upserted: ${projectsUpserted}`);
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
