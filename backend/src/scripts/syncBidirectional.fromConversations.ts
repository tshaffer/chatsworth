/* backend/src/scripts/syncBidirectional.fromConversations.ts */
/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import fs from 'fs/promises';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { runBidirectionalSync, type ExportPayload, type ISOString, type SyncSummary } from './syncCore';

/** Raw ChatGPT export types (pared down to what we use) */
type Role = 'user' | 'assistant' | 'system' | string;

interface ExportMessage {
  id: string;
  author?: { role?: Role };
  content?: unknown;
  create_time?: number; // seconds since epoch (typical for exports)
  update_time?: number;
}

interface MappingNode {
  id: string;
  message?: ExportMessage | null;
  parent?: string | null;
  children?: string[];
}

interface ConvProject {
  id: string | null;
  name: string | null;
}

interface Conversation {
  id: string;
  title?: string | null;
  create_time?: number;
  update_time?: number;
  current_node?: string | null;
  mapping?: Record<string, MappingNode>;
  project?: ConvProject | null;
}

/** CLI arg */
function argFile(): string {
  const p = process.argv[2];
  if (!p) {
    console.error('ERROR: Provide path to conversations-with-projects.json');
    process.exit(1);
  }
  return path.resolve(p);
}

/** seconds/ms → ISO string (or undefined) */
function toIso(t?: number): ISOString | undefined {
  if (t === undefined || t === null) return undefined;
  const ms = t > 1e12 ? t : t * 1000;
  return new Date(ms).toISOString();
}

/** Best-effort text extraction from typical ChatGPT export message.content */
function extractText(msg?: ExportMessage): string {
  if (!msg || msg.content == null) return '';
  const c = msg.content as any;

  // common structure: { content_type: "text", parts: ["..."] }
  if (Array.isArray(c?.parts)) return c.parts.join('\n');

  // sometimes: { text: "..." }
  if (typeof c?.text === 'string') return c.text;

  // fallback if content itself is a string
  if (typeof c === 'string') return c;

  return '';
}

/** Return first non-empty line as a lightweight title */
function firstLine(s: string): string {
  const line = (s ?? '').split(/\r?\n/)[0] ?? '';
  return line.trim();
}

/** Extract user+assistant messages in chronological order */
function extractMessages(conv: Conversation): ExportMessage[] {
  const nodes = conv.mapping ? Object.values(conv.mapping) : [];
  const msgs: ExportMessage[] = [];

  for (const n of nodes) {
    const m = n?.message;
    if (!m) continue;
    const role = m.author?.role;
    if (role === 'user' || role === 'assistant') msgs.push(m);
  }

  msgs.sort((a, b) => {
    const ta = a.create_time ?? a.update_time ?? 0;
    const tb = b.create_time ?? b.update_time ?? 0;
    return ta - tb;
  });

  return msgs;
}

/** Pair user → immediate next assistant turn into one Chatsworth entry */
function pairIntoEntries(conv: Conversation): ExportPayload['entries'] {
  const messages = extractMessages(conv);
  const entries: ExportPayload['entries'] = [];

  const projectId = conv.project?.id ?? 'manual_unassigned';
  const chatId = conv.id;

  let position = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.author?.role !== 'user') continue;

    const userText = extractText(m);

    // the assistant reply right after the user message, if present
    let assistantText = '';
    let assistantTime: number | undefined;
    if (i + 1 < messages.length && messages[i + 1].author?.role === 'assistant') {
      assistantText = extractText(messages[i + 1]);
      assistantTime = messages[i + 1].update_time ?? messages[i + 1].create_time;
    }

    const entryId = m.id; // stable user message ID works well as entry ID
    const updated = Math.max(m.update_time ?? m.create_time ?? 0, assistantTime ?? 0);
    entries.push({
      id: entryId,
      projectId,
      chatId,
      position: position++,
      title: firstLine(userText) || (conv.title ?? '') || '(untitled)',
      originalPrompt: userText,
      promptSummary: '', // Chatsworth can override later
      response: assistantText,
      updatedAt: toIso(updated),
      deleted: false,
    });
  }

  return entries;
}

/** Convert conversations-with-projects.json → flattened payload */
function flatten(convs: Conversation[]): ExportPayload {
  const projectsMap = new Map<string, { id: string; name: string; updatedAt?: ISOString }>();
  const chats: ExportPayload['chats'] = [];
  const entries: ExportPayload['entries'] = [];

  for (const conv of convs) {
    const projId = conv.project?.id ?? 'manual_unassigned';
    const projName = conv.project?.name ?? 'Unassigned';

    if (!projectsMap.has(projId)) {
      projectsMap.set(projId, {
        id: projId,
        name: projName,
        updatedAt: toIso(conv.update_time ?? conv.create_time),
      });
    }

    chats.push({
      id: conv.id,
      projectId: projId,
      title: conv.title ?? '(untitled conversation)',
      updatedAt: toIso(conv.update_time ?? conv.create_time),
    });

    const paired = pairIntoEntries(conv);
    entries.push(...paired);
  }

  return {
    projects: Array.from(projectsMap.values()),
    chats,
    entries,
  };
}

/** MAIN */
(async () => {
  const file = argFile();
  await connectDB();

  const raw = await fs.readFile(file, 'utf8');
  const conversations: Conversation[] = JSON.parse(raw);

  const payload: ExportPayload = flatten(conversations);

  const summary: SyncSummary = await runBidirectionalSync(payload);

  console.log('=== Sync Summary ===');
  console.log(JSON.stringify(summary, null, 2));

  await mongoose.disconnect();
  process.exit(0);
})().catch(async (err: unknown) => {
  console.error('Sync failed:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
