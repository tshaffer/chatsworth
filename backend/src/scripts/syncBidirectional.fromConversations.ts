/* eslint-disable no-console */
/**
 * Flatten conversations-with-projects.json → ExportPayload and run bidirectional sync.
 * - Block-aware extraction (handles legacy parts[], block arrays, code/tool blocks)
 * - Main-path filtering like ChatGPT UI
 * - Pairs user → last non-empty assistant between user turns
 * - Appends tool output when configured
 * - Emits stable entryId = user message id (or user id + suffix for 'multi')
 */

import dotenv from 'dotenv';
dotenv.config({
  path: require('path').resolve(__dirname, '../../.env'),
});

import path from 'path';
import fs from 'fs/promises';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import {
  runBidirectionalSync,
  type ExportPayload,
  type ISOString,
  type SyncSummary,
} from './syncCore';
import { entryFingerprint } from './fingerprint';
import { ChatEntryModel, TombstoneModel } from '../models'; // ⬅️ ensure TombstoneModel is exported

/* ────────────────────────────────────────────────────────────
   CLI args
   ──────────────────────────────────────────────────────────── */
function parseArgs(): { file: string; dryRun: boolean; logDiffs: boolean } {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dryRun');
  const logDiffs = args.includes('--logDiffs') || args.includes('--diff');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Usage: ts-node syncBidirectional.fromConversations.ts /path/to/conversations-with-projects.json [--dryRun] [--logDiffs]');
    process.exit(1);
  }
  return { file: path.resolve(file), dryRun, logDiffs };
}

/* ────────────────────────────────────────────────────────────
   Pairing configuration (to mirror ChatGPT UI)
   ──────────────────────────────────────────────────────────── */
type PathPolicy = 'all' | 'main';
type AssistantPolicy = 'keep-first' | 'keep-latest' | 'concat-all' | 'multi';
type UserDraftPolicy = 'keep-each' | 'concat' | 'keep-latest';
type TitlePolicy = 'first-user' | 'prefer-conv-title';

type PairingConfig = {
  path: PathPolicy;
  assistantPolicy: AssistantPolicy;
  userDraftPolicy: UserDraftPolicy;
  includeSystemInPrompt: boolean;
  includeToolInResponse: boolean;
  keepEmptyAssistant: boolean;
  titlePolicy: TitlePolicy;
};

const CFG: PairingConfig = {
  path: 'main',
  assistantPolicy: 'keep-latest',
  userDraftPolicy: 'keep-each',
  includeSystemInPrompt: false,
  includeToolInResponse: true,
  keepEmptyAssistant: true,
  titlePolicy: 'prefer-conv-title',
};

/* ────────────────────────────────────────────────────────────
   Export JSON (conversations-with-projects.json) types
   ──────────────────────────────────────────────────────────── */
type Role = 'user' | 'assistant' | 'system' | 'tool' | string;

interface ExportMessage {
  id?: string;
  author?: { role?: Role | null } | null;
  content?: unknown;
  create_time?: number | string | null;
  update_time?: number | string | null;
  end_turn?: boolean | null;
}

interface MappingNode {
  id?: string;
  message?: ExportMessage | null;
  parent?: string | null;
  children?: string[];
  create_time?: number | string | null;
  update_time?: number | string | null;
}

interface ConvProject {
  id: string | null;
  name: string | null;
}

interface Conversation {
  id: string;
  title?: string | null;
  create_time?: number | string | null;
  update_time?: number | string | null;
  current_node?: string | null;
  mapping?: Record<string, MappingNode>;
  project?: ConvProject | null;
}

/* ────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────── */
function toSecs(v?: number | string | null): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function toIsoFromSecs(v?: number | string | null): ISOString | undefined {
  const n = toSecs(v);
  return n !== undefined ? new Date(n * 1000).toISOString() : undefined;
}
function firstLine(s: string): string {
  return (s ?? '').split(/\r?\n/)[0]?.trim() ?? '';
}

/** Block-aware text extraction across legacy and newer shapes */
function extractText(msg?: ExportMessage | null): string {
  if (!msg || msg.content == null) return '';
  const c: any = msg.content;

  // Newer block-array shape
  if (Array.isArray(c)) {
    const pieces: string[] = [];
    for (const b of c) {
      const typ = b?.type ?? b?.content_type;

      // text-ish
      const textish =
        b?.text?.value ??
        b?.text ??
        (Array.isArray(b?.parts) ? b.parts.join('\n') : undefined);

      if (typ === 'output_text' || typ === 'input_text' || typ === 'text' || typeof textish === 'string') {
        if (textish) pieces.push(String(textish).trim());
        continue;
      }

      // code blocks
      if (typ === 'code' || typ === 'code_block') {
        const code = b?.code ?? b?.text?.value ?? b?.text;
        const lang = b?.language ?? b?.lang ?? '';
        if (code) pieces.push(`\`\`\`${lang || ''}\n${String(code)}\n\`\`\``.trim());
        continue;
      }

      // tool results
      if (typ === 'tool_result' || typ === 'tool_output') {
        const t = b?.text?.value ?? b?.output ?? b?.result ?? '';
        if (t) pieces.push(String(t).trim());
        continue;
      }

      // fallbacks
      if (Array.isArray(b?.parts)) pieces.push(b.parts.filter((p: any) => typeof p === 'string').join('\n').trim());
      else if (typeof b?.text === 'string') pieces.push(b.text.trim());
      else if (typeof b === 'string') pieces.push(b.trim());
    }
    return pieces.join('\n').trim();
  }

  // Legacy shapes
  if (Array.isArray(c?.parts)) return c.parts.filter((p: any) => typeof p === 'string').join('\n').trim();
  if (typeof c?.text === 'string') return c.text.trim();
  if (typeof c === 'string') return c.trim();
  return '';
}

type FlatRole = 'user' | 'assistant' | 'system' | 'tool';
type FlatMsg = {
  nodeId: string;
  role: FlatRole;
  text: string;
  tCreate?: number;
  tUpdate?: number;
  endTurn?: boolean;
};

function mainPathNodeIds(mapping: Record<string, MappingNode>, current?: string | null): Set<string> {
  const ids: string[] = [];
  let cur = current ?? null;
  while (cur && mapping[cur]) {
    ids.push(cur);
    cur = mapping[cur].parent ?? null;
  }
  return new Set(ids.reverse());
}

/** Order messages (optionally restrict to main path) and drop assistant tool-calls/empties */
function orderedMessages(conv: Conversation, cfg: PairingConfig): FlatMsg[] {
  const mapping = conv.mapping || {};
  let entries = Object.entries(mapping);
  if (cfg.path === 'main' && conv.current_node && mapping[conv.current_node]) {
    const keep = mainPathNodeIds(mapping, conv.current_node);
    entries = entries.filter(([id]) => keep.has(id));
  }

  const out: FlatMsg[] = [];
  for (const [key, node] of entries) {
    const m = node.message;
    const roleRaw = m?.author?.role ?? '';
    let role: FlatRole | null = null;

    if (roleRaw === 'user') role = 'user';
    else if (roleRaw === 'assistant') role = 'assistant';
    else if (roleRaw === 'system') role = 'system';
    else if (roleRaw === 'tool' || roleRaw === 'function') role = 'tool';

    if (!role) continue;

    const ct = (m as any)?.content?.content_type;
    const text = extractText(m);

    // Skip assistant tool-calls and empty assistant stubs
    if (role === 'assistant' && (ct === 'code' || !text)) continue;

    out.push({
      nodeId: node.id || key,
      role,
      text,
      tCreate: toSecs(node.create_time ?? m?.create_time),
      tUpdate: toSecs(node.update_time ?? m?.update_time),
      endTurn: !!m?.end_turn,
    });
  }

  const roleOrder: Record<FlatRole, number> = { user: 0, assistant: 1, system: 2, tool: 3 };
  out.sort((a, b) => {
    const ta = a.tCreate ?? a.tUpdate ?? Number.POSITIVE_INFINITY;
    const tb = b.tCreate ?? b.tUpdate ?? Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    if (roleOrder[a.role] !== roleOrder[b.role]) return roleOrder[a.role] - roleOrder[b.role];
    return String(a.nodeId).localeCompare(String(b.nodeId));
  });

  return out;
}

/** Pair user → assistant segment and produce ExportPayload.entries (with entryId, updatedAt) */
function pairIntoEntries(
  msgs: FlatMsg[],
  projectId: string,
  chatId: string,
  chatTitle: string | null | undefined,
  exportedAt: Date,
  cfg: PairingConfig
): ExportPayload['entries'] {
  const entries: ExportPayload['entries'] = [];
  let pos = 0;
  let lastSystem = '';

  let i = 0;
  while (i < msgs.length) {
    const m = msgs[i];

    // Track latest system text if we choose to prepend
    if (m.role === 'system') {
      if (m.text) lastSystem = m.text;
      i++;
      continue;
    }

    if (m.role !== 'user') {
      i++;
      continue;
    }

    const user = m;
    i++;

    // Collect until next user
    const seg: FlatMsg[] = [];
    while (i < msgs.length && msgs[i].role !== 'user') seg.push(msgs[i++]);

    const assistants = seg.filter((s) => s.role === 'assistant');
    const tools = seg.filter((s) => s.role === 'tool');

    const basePrompt = (user.text || '').trim();
    const prompt =
      cfg.includeSystemInPrompt && lastSystem ? `${lastSystem}\n\n${basePrompt}` : basePrompt;

    const userLine = firstLine(basePrompt) || '(untitled)';
    const entryTitle =
      cfg.titlePolicy === 'prefer-conv-title' && chatTitle ? chatTitle : userLine;
    const promptSummary = prompt;

    const toolAppendix =
      cfg.includeToolInResponse && tools.length
        ? `\n\n---\n[tool outputs]\n${tools.map((t) => t.text).filter(Boolean).join('\n')}`
        : '';

    const mk = (entryId: string, response: string, freshnessFrom: FlatMsg[]) => {
      const stamps: number[] = [];
      const push = (f?: FlatMsg) => {
        if (!f) return;
        const t = f.tUpdate ?? f.tCreate;
        if (typeof t === 'number' && Number.isFinite(t)) stamps.push(t);
      };
      push(user);
      if (cfg.includeToolInResponse) tools.forEach(push);
      freshnessFrom.forEach(push);
      const max = stamps.length ? Math.max(...stamps) : undefined;
      const updatedAt = max ? new Date(max * 1000).toISOString() : undefined;

      entries.push({
        entryId: user.nodeId,      // stable id from the user message
        projectId,
        chatId,
        position: pos++,
        title: entryTitle,
        originalPrompt: prompt,
        promptSummary,
        response,
        updatedAt,
        deleted: false,
      });
    };

    if (assistants.length === 0) {
      if (cfg.keepEmptyAssistant) mk(user.nodeId, '' + (cfg.includeToolInResponse ? toolAppendix : ''), []);
      continue;
    }

    const aTexts = assistants.map((a) => (a.text || '').trim());

    switch (cfg.assistantPolicy) {
      case 'keep-first': {
        const resp = aTexts[0] + toolAppendix;
        mk(user.nodeId, resp, [assistants[0]]);
        break;
      }
      case 'keep-latest': {
        // choose the last non-empty; fallback to last
        let idx = aTexts.length - 1;
        while (idx > 0 && !aTexts[idx]) idx--;
        const resp = (aTexts[idx] || '') + toolAppendix;
        mk(user.nodeId, resp, [assistants[idx]]);
        break;
      }
      case 'concat-all': {
        const resp = aTexts.join('\n\n---\n') + toolAppendix;
        mk(user.nodeId, resp, assistants);
        break;
      }
      case 'multi': {
        aTexts.forEach((resp, k) => {
          mk(`${user.nodeId}#${k + 1}`, resp + toolAppendix, [assistants[k]]);
        });
        break;
      }
    }
  }

  return entries;
}

/** Convert conversations → flattened ExportPayload expected by syncCore */
function flatten(convs: Conversation[]): ExportPayload {
  const projects = new Map<string, { id: string; name: string; updatedAt?: ISOString }>();
  const chats: ExportPayload['chats'] = [];
  const entries: ExportPayload['entries'] = [];

  for (const conv of convs) {
    const projId = conv.project?.id ?? 'manual_unassigned';
    const projName = conv.project?.name ?? 'Unassigned';

    if (!projects.has(projId)) {
      projects.set(projId, {
        id: projId,
        name: projName,
        updatedAt: toIsoFromSecs(conv.update_time ?? conv.create_time),
      });
    }

    chats.push({
      id: conv.id,
      projectId: projId,
      title: conv.title ?? '(untitled conversation)',
      updatedAt: toIsoFromSecs(conv.update_time ?? conv.create_time),
    });

    const msgs = orderedMessages(conv, CFG);
    const paired = pairIntoEntries(msgs, projId, conv.id, conv.title, new Date(), CFG);
    entries.push(...paired);
  }

  return {
    projects: Array.from(projects.values()),
    chats,
    entries,
  };
}

/* ────────────────────────────────────────────────────────────
   Deletion guards (tombstones + soft-deletes in DB)
   ──────────────────────────────────────────────────────────── */

function chatKey(projectId: string, chatId: string) {
  return `${projectId}::${chatId}`;
}
function entryKey(projectId: string, chatId: string, entryId: string) {
  return `${projectId}::${chatId}::${entryId}`;
}

async function applyDeletionGuards(
  payload: ExportPayload,
  { logSkips }: { logSkips: boolean }
): Promise<void> {
  // 1) Load tombstones
  const tombs = await TombstoneModel.find({}).lean();
  const deadProjectIds = new Set<string>();
  const deadChatKeys = new Set<string>();
  const deadEntryKeys = new Set<string>();

  for (const t of tombs as any[]) {
    if (t.kind === 'project' && t.projectId) deadProjectIds.add(t.projectId);
    else if (t.kind === 'chat' && t.projectId && t.chatId) deadChatKeys.add(chatKey(t.projectId, t.chatId));
    else if (t.kind === 'entry' && t.projectId && t.chatId && t.entryId) {
      deadEntryKeys.add(entryKey(t.projectId, t.chatId, t.entryId));
    }
  }

  // 2) Respect existing soft-deleted entries in DB even without tombstones
  const softDeletedEntries = await ChatEntryModel.find(
    { deletedAt: { $exists: true, $ne: null } },
    { entryId: 1, projectId: 1, chatId: 1, _id: 0 }
  ).lean();

  for (const e of softDeletedEntries as any[]) {
    if (e.projectId && e.chatId && e.entryId) {
      deadEntryKeys.add(entryKey(e.projectId, e.chatId, e.entryId));
    }
  }

  // Index for titles (for nicer logs)
  const chatTitleByKey = new Map<string, string>();
  for (const c of payload.chats) chatTitleByKey.set(chatKey(c.projectId, c.id), c.title ?? '');

  // 3) Filter payload with logs
  const originalCounts = {
    projects: payload.projects.length,
    chats: payload.chats.length,
    entries: payload.entries.length,
  };

  payload.projects = payload.projects.filter((p) => {
    const isDead = deadProjectIds.has(p.id);
    if (isDead && logSkips) {
      console.log(`[PROJECT][SKIP_TOMBSTONE] ${p.name} (${p.id})`);
    }
    return !isDead;
  });

  payload.chats = payload.chats.filter((c) => {
    if (deadProjectIds.has(c.projectId)) {
      if (logSkips) console.log(`[CHAT][SKIP_PARENT_DEAD] ${c.title} (${chatKey(c.projectId, c.id)})`);
      return false;
    }
    const k = chatKey(c.projectId, c.id);
    const isDead = deadChatKeys.has(k);
    if (isDead && logSkips) {
      console.log(`[CHAT][SKIP_TOMBSTONE] ${c.title} (${k})`);
    }
    return !isDead;
  });

  payload.entries = payload.entries.filter((e) => {
    if (deadProjectIds.has(e.projectId)) {
      if (logSkips) console.log(`[ENTRY][SKIP_PARENT_PROJECT_DEAD] ${e.entryId} (${e.projectId})`);
      return false;
    }
    const ck = chatKey(e.projectId, e.chatId);
    if (deadChatKeys.has(ck)) {
      if (logSkips) console.log(`[ENTRY][SKIP_PARENT_CHAT_DEAD] ${e.entryId} (${ck})`);
      return false;
    }
    const ek = entryKey(e.projectId, e.chatId, e.entryId);
    const isDead = deadEntryKeys.has(ek);
    if (isDead && logSkips) {
      const title = chatTitleByKey.get(ck) ?? '';
      console.log(`[ENTRY][SKIP_TOMBSTONE] ${e.entryId} (chat="${title}" key=${ek})`);
    }
    return !isDead;
  });

  if (logSkips) {
    const afterCounts = {
      projects: payload.projects.length,
      chats: payload.chats.length,
      entries: payload.entries.length,
    };
    console.log(
      `[SKIP_SUMMARY] projects ${originalCounts.projects}→${afterCounts.projects}, chats ${originalCounts.chats}→${afterCounts.chats}, entries ${originalCounts.entries}→${afterCounts.entries}`
    );
  }
}

/* ────────────────────────────────────────────────────────────
   MAIN
   ──────────────────────────────────────────────────────────── */
(async () => {
  const { file, dryRun, logDiffs } = parseArgs();
  await connectDB();

  const raw = await fs.readFile(file, 'utf8');
  const conversations: Conversation[] = JSON.parse(raw);
  if (!Array.isArray(conversations)) {
    throw new Error('Input must be an array of conversations');
  }

  const payload = flatten(conversations);

  // ⬇️ Enforce DB-source-of-truth for deletions (tombstones + soft-deletes)
  await applyDeletionGuards(payload, { logSkips: logDiffs });

  const summary: SyncSummary = await runBidirectionalSync(payload, { dryRun, logDiffs });

  // Persist fingerprints for all non-deleted (non-skipped) entries in this payload
  const bulk = payload.entries
    .filter((e) => !e.deleted)
    .map((e) => ({
      updateOne: {
        filter: { entryId: e.entryId },
        update: {
          $set: {
            fingerprint: entryFingerprint({
              title: e.title,
              promptSummary: e.promptSummary,
              response: e.response,
              position: e.position,
              chatId: e.chatId,
              projectId: e.projectId,
            }),
          },
        },
        upsert: false,
      },
    }));

  if (bulk.length) {
    try {
      await ChatEntryModel.bulkWrite(bulk, { ordered: false });
    } catch (err) {
      console.error('Failed to stamp fingerprints after sync:', err);
    }
  }
  console.log('=== Sync Summary ===');
  console.log(JSON.stringify(summary, null, 2));

  await mongoose.disconnect();
  process.exit(0);
})().catch(async (err) => {
  console.error('Sync failed:', err);
  try { await mongoose.disconnect(); } catch { }
  process.exit(1);
});
