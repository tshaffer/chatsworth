/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import fs from 'fs/promises';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { runBidirectionalSync, ExportPayload } from './syncCore';

// ──────────────────────────────────────────────────────────────
// Types that match your “conversations-with-projects.json”
// (lightweight; we only use the parts we need)
// ──────────────────────────────────────────────────────────────
type ISO = string;

type ConvProject = {
  id: string | null;
  name: string | null;
} | null;

type ExportMessage = {
  id: string;
  author?: { role?: 'user' | 'assistant' | 'system' | string };
  content?: { content_type?: string; parts?: string[] } | any;
  create_time?: number;        // seconds since epoch (typical in ChatGPT export)
  update_time?: number;
  // …other fields ignored
};

type MappingNode = {
  id: string;
  message?: ExportMessage | null;
  parent?: string | null;
  children?: string[];
};

type Conversation = {
  id: string;
  title?: string | null;
  create_time?: number;
  update_time?: number;
  current_node?: string | null;
  mapping?: Record<string, MappingNode>;
  project?: ConvProject;
  // …other fields ignored
};

// ──────────────────────────────────────────────────────────────
// CLI usage: tsx src/scripts/syncBidirectional.fromConversations.ts /path/to/conversations-with-projects.json
// ──────────────────────────────────────────────────────────────
function argFile(): string {
  const p = process.argv[2];
  if (!p) {
    console.error('ERROR: Provide path to conversations-with-projects.json');
    process.exit(1);
  }
  return path.resolve(p);
}

function toIso(t?: number): ISO | undefined {
  if (!t && t !== 0) return undefined;
  // ChatGPT exports usually store seconds; guard if it’s ms already.
  const ms = t > 1e12 ? t : t * 1000;
  return new Date(ms).toISOString();
}

function firstLine(s: string): string {
  const line = s.split(/\r?\n/)[0] ?? '';
  return line.trim();
}

// Extract plain text from a ChatGPT export “message”
function extractText(msg?: ExportMessage): string {
  if (!msg) return '';
  const c = msg.content as any;
  if (!c) return '';
  // Typical structure: { content_type: "text", parts: [ "...", ... ] }
  if (Array.isArray(c.parts)) return c.parts.join('\n');
  if (typeof c.text === 'string') return c.text;
  if (typeof c === 'string') return c;
  return '';
}

// Walk the mapping nodes → get messages in chronological order
function extractMessages(conv: Conversation): ExportMessage[] {
  const nodes = conv.mapping ? Object.values(conv.mapping) : [];
  const msgs: ExportMessage[] = [];

  for (const n of nodes) {
    if (n?.message?.author?.role === 'user' || n?.message?.author?.role === 'assistant') {
      msgs.push(n.message);
    }
  }

  // sort by create_time (fallback to update_time)
  msgs.sort((a, b) => {
    const ta = a.create_time ?? a.update_time ?? 0;
    const tb = b.create_time ?? b.update_time ?? 0;
    return ta - tb;
  });

  return msgs;
}

// Pair user → assistant into ChatEntries for Chatsworth
function pairIntoEntries(conv: Conversation) {
  const messages = extractMessages(conv);
  const entries: {
    id: string;
    projectId: string;
    chatId: string;
    position: number;
    title: string;
    originalPrompt: string;
    promptSummary: string;
    response: string;
    updatedAt?: ISO;
    deleted?: boolean;
  }[] = [];

  const projectId = conv.project?.id ?? 'manual_unassigned';
  const chatId = conv.id;

  let position = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.author?.role !== 'user') continue;

    const userText = extractText(m);
    // Find the next assistant response (if contiguous)
    let assistantText = '';
    let assistantTime: number | undefined;
    if (i + 1 < messages.length && messages[i + 1].author?.role === 'assistant') {
      assistantText = extractText(messages[i + 1]);
      assistantTime = messages[i + 1].update_time ?? messages[i + 1].create_time;
    }

    const entryId = m.id; // Stable ID per user message (good as primary for Chatsworth)
    const updated = Math.max(
      m.update_time ?? m.create_time ?? 0,
      assistantTime ?? 0
    );

    entries.push({
      id: entryId,
      projectId,
      chatId,
      position: position++,
      title: firstLine(userText) || (conv.title ?? '') || '(untitled)',
      originalPrompt: userText,
      promptSummary: '',     // Chatsworth may fill/override later
      response: assistantText,
      updatedAt: toIso(updated),
      deleted: false,
    });
  }

  return entries;
}

// Convert your conversations-with-projects.json → flattened export payload
function flatten(convs: Conversation[]): ExportPayload {
  const projectsMap = new Map<string, { id: string; name: string; updatedAt?: ISO }>();
  const chats: ExportPayload['chats'] = [];
  const entries: ExportPayload['entries'] = [];

  for (const conv of convs) {
    const projId = conv.project?.id ?? 'manual_unassigned';
    const projName = conv.project?.name ?? 'Unassigned';

    // collect project
    if (!projectsMap.has(projId)) {
      projectsMap.set(projId, {
        id: projId,
        name: projName,
        updatedAt: toIso(conv.update_time ?? conv.create_time),
      });
    }

    // collect chat (conversation)
    chats.push({
      id: conv.id,
      projectId: projId,
      title: conv.title ?? '(untitled conversation)',
      updatedAt: toIso(conv.update_time ?? conv.create_time),
    });

    // collect entries
    const paired = pairIntoEntries(conv);
    entries.push(...paired);
  }

  return {
    projects: Array.from(projectsMap.values()),
    chats,
    entries,
  };
}

// ──────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────
(async () => {
  const file = argFile();
  await connectDB();

  const raw = await fs.readFile(file, 'utf8');
  const conversations: Conversation[] = JSON.parse(raw);

  // Flatten to the format the core sync expects
  const payload = flatten(conversations);

  // Run the same reconciliation core as before
  const summary = await runBidirectionalSync(payload);

  console.log('=== Sync Summary ===');
  console.log(JSON.stringify(summary, null, 2));

  await mongoose.disconnect();
  process.exit(0);
})().catch(async (err) => {
  console.error('Sync failed:', err);
  try { await mongoose.disconnect(); } catch { }
  process.exit(1);
});
