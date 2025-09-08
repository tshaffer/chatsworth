/**
  *   From
 *      /Users/tedshaffer/Documents/Projects/chatsworth/backend
 *          npx ts-node src/scripts/import-conversations-to-db.ts /Users/tedshaffer/Documents/Projects/chatgpt-export-parser/data/chatGPTExport-08-24-25-0/conversations-with-projects.json
 *
 * Bulk importer aligned with Option A (embedded chats) and new sync — with configurable pairing behavior.
 *
 * Projects:    { projectId, name, chats: [ { chatId, title, projectId, projectName, messageCount,
 *                metadata: { sourceUpdatedAt, exportedAt, ... } } ] }
 * ChatEntries: { en  tryId, projectId, chatId, position, title, originalPrompt, promptSummary, response,
 *                sourceUpdatedAt, exportedAt, fingerprint, ... }
 *
 * Usage:
 *   npx ts-node src/scripts/import-conversations-to-db.ts \
 *     /path/to/conversations-with-projects.json \
 *     [--fresh] \
 *     [--path=main|all] \
 *     [--assistantPolicy=keep-first|keep-latest|concat-all|multi] \
 *     [--userDraftPolicy=keep-each|concat|keep-latest] \
 *     [--includeSystemInPrompt=true|false] \
 *     [--includeToolInResponse=true|false] \
 *     [--keepEmptyAssistant=true|false] \
 *     [--titlePolicy=first-user|prefer-conv-title]
 *
 * Notes:
 * - Upserts Projects by projectId.
 * - Chats are refreshed via pull → push (embedded in Project).
 * - Entries are upserted by entryId (stable user message ID; “multi” appends #k).
 * - If --fresh is passed, existing ChatEntry rows for the listed chatIds are deleted before upserting.
 */

import dotenv from 'dotenv';
dotenv.config({
  path: require('path').resolve(__dirname, '../../.env')
});

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { entryFingerprint } from './fingerprint';
import type { UpdateQuery } from 'mongoose';
import type { ChatEntryDoc } from '../models/ChatEntry';

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI not set');
  process.exit(1);
}

import { ProjectModel } from '../models/Project';
import { ChatEntryModel } from '../models/ChatEntry';

/* ============================ Pairing Config ============================ */

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

// Defaults chosen to mirror ChatGPT UI closely and be stable.
const CFG: PairingConfig = {
  path: 'main',
  assistantPolicy: 'keep-latest',
  userDraftPolicy: 'keep-each',
  includeSystemInPrompt: false,
  includeToolInResponse: false,
  keepEmptyAssistant: true,
  titlePolicy: 'first-user', // for entries; chat title still uses conv.title
};

// CLI overrides (simple --key=value parser)
function applyCliOverrides(cfg: PairingConfig, args: string[]) {
  const kv = Object.fromEntries(
    args
      .filter(a => a.startsWith('--') && a.includes('='))
      .map(a => {
        const [k, ...rest] = a.slice(2).split('=');
        return [k, rest.join('=')];
      })
  );
  const bool = (v?: string) => (v === 'true' ? true : v === 'false' ? false : undefined);

  if (kv.path === 'main' || kv.path === 'all') cfg.path = kv.path as PathPolicy;
  if (['keep-first', 'keep-latest', 'concat-all', 'multi'].includes(kv.assistantPolicy))
    cfg.assistantPolicy = kv.assistantPolicy as AssistantPolicy;
  if (['keep-each', 'concat', 'keep-latest'].includes(kv.userDraftPolicy))
    cfg.userDraftPolicy = kv.userDraftPolicy as UserDraftPolicy;

  const sys = bool(kv.includeSystemInPrompt);
  if (typeof sys === 'boolean') cfg.includeSystemInPrompt = sys;
  const tool = bool(kv.includeToolInResponse);
  if (typeof tool === 'boolean') cfg.includeToolInResponse = tool;
  const keepEmpty = bool(kv.keepEmptyAssistant);
  if (typeof keepEmpty === 'boolean') cfg.keepEmptyAssistant = keepEmpty;

  if (kv.titlePolicy === 'first-user' || kv.titlePolicy === 'prefer-conv-title')
    cfg.titlePolicy = kv.titlePolicy as TitlePolicy;
}

/* ============================ Export Types ============================ */

type ProjectTag = { id: string; name: string } | null;

// --- Types (replace your ExportMessage/ExportNode content area) ---
type ExportContent = {
  content_type?: string;
  parts?: string[];
  text?: string;           // present for content_type: "code" (tool-call), sometimes others
  language?: string | null;
};

type ExportMessage = {
  id?: string;
  author?: { role?: string | null } | null;
  content?: ExportContent | null;
  create_time?: number | string | null;
  update_time?: number | string | null;
  end_turn?: boolean | null;
  metadata?: any;
};

type ExportNode = {
  id?: string;
  parent?: string | null;
  children?: string[] | null;
  message?: ExportMessage | null;
  create_time?: number | string | null;
  update_time?: number | string | null;
};

// ───────────────── orderedMessages (keeps signature: (conv, CFG)) ─────────────────

type Role = 'user' | 'assistant' | 'system' | 'tool';

type FlatMsg = {
  nodeId: string;
  role: Role;
  text: string;
  tCreate?: number;
  tUpdate?: number;
  endTurn?: boolean;
};

function mainPathNodeIds(mapping: Record<string, ExportNode>, current?: string | null): Set<string> {
  const ids: string[] = [];
  let cur = current ?? null;
  while (cur && mapping[cur]) {
    ids.push(cur);
    cur = mapping[cur].parent ?? null;
  }
  return new Set(ids.reverse());
}

function orderedMessages(conv: ExportConversation, cfg: PairingConfig): FlatMsg[] {
  const mapping = conv.mapping || {};
  let entries: [string, ExportNode][];

  if (cfg.path === 'main' && conv.current_node && mapping[conv.current_node]) {
    const keep = mainPathNodeIds(mapping, conv.current_node);
    entries = Object.entries(mapping).filter(([id]) => keep.has(id));
  } else {
    entries = Object.entries(mapping);
  }

  const out: FlatMsg[] = [];
  for (const [key, node] of entries) {
    const m = node.message;
    const roleRaw = m?.author?.role ?? '';
    let role: Role | null = null;

    if (roleRaw === 'user') role = 'user';
    else if (roleRaw === 'assistant') role = 'assistant';
    else if (roleRaw === 'system') role = 'system';
    else if (roleRaw === 'tool' || roleRaw === 'function') role = 'tool';

    if (!role) continue;

    const ct = (m?.content as any)?.content_type;
    const text = extractText(m);

    // IMPORTANT: skip assistant "tool-calls" (content_type: code) and empty assistant stubs
    if (role === 'assistant' && (ct === 'code' || !text)) continue;

    const nodeId = node.id || key;
    const tCreate = toNumberSeconds(node.create_time ?? m?.create_time);
    const tUpdate = toNumberSeconds(node.update_time ?? m?.update_time);
    const endTurn = !!m?.end_turn;

    // Keep system/tool — they’re useful if you set includeSystem/Tool flags;
    // we’ll decide later whether to prepend/append them.
    out.push({ nodeId, role, text, tCreate, tUpdate, endTurn });
  }

  const roleOrder: Record<Role, number> = { user: 0, assistant: 1, system: 2, tool: 3 };
  out.sort((a, b) => {
    const ta = a.tCreate ?? a.tUpdate ?? Number.POSITIVE_INFINITY;
    const tb = b.tCreate ?? b.tUpdate ?? Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    if (roleOrder[a.role] !== roleOrder[b.role]) return roleOrder[a.role] - roleOrder[b.role];
    // deterministic tie-break
    return String(a.nodeId).localeCompare(String(b.nodeId));
  });

  return out;
}

// ───────────────── pairIntoEntries (keeps signature: (msgs, projectId, chatId, chatTitle, exportedAt, CFG)) ─────────────────

function pairIntoEntries(
  msgs: FlatMsg[],
  projectId: string,
  chatId: string,
  chatTitle: string | undefined,
  exportedAt: Date,
  cfg: PairingConfig
) {
  type Upsert = {
    filter: { entryId: string };
    doc: {
      entryId: string;
      projectId: string;
      chatId: string;
      position: number;
      title: string;
      originalPrompt: string;
      promptSummary: string;
      response: string;
      source: string;
      sourceUpdatedAt?: Date;
      exportedAt: Date;
      fingerprint: string;
    };
  };

  const upserts: Upsert[] = [];
  let pos = 0;
  let lastSystemText = '';

  let i = 0;
  while (i < msgs.length) {
    const m = msgs[i];

    // track latest system (optional prepend)
    if (m.role === 'system') {
      if (m.text) lastSystemText = m.text;
      i++;
      continue;
    }

    if (m.role !== 'user') {
      i++;
      continue;
    }

    const user = m;
    i++;

    // gather assistants/tools until next user
    const segment: FlatMsg[] = [];
    while (i < msgs.length && msgs[i].role !== 'user') {
      segment.push(msgs[i]);
      i++;
    }

    const assistants = segment.filter(s => s.role === 'assistant');
    const tools = segment.filter(s => s.role === 'tool');

    const basePrompt = (user.text || '').trim();
    const prompt =
      cfg.includeSystemInPrompt && lastSystemText
        ? `${lastSystemText}\n\n${basePrompt}`
        : basePrompt;

    // Title and summary: summary ALWAYS from user prompt; title per policy
    const userLineForSummary = firstLine(basePrompt) || '(untitled)';
    const entryTitle =
      cfg.titlePolicy === 'prefer-conv-title' && chatTitle ? chatTitle : userLineForSummary;
    const promptSummary = prompt;

    const toolAppendix = cfg.includeToolInResponse && tools.length
      ? `\n\n---\n[tool outputs]\n${tools.map(t => t.text).filter(Boolean).join('\n')}`
      : '';

    // helper to compute sourceUpdatedAt and push an upsert
    const mk = async (entryId: string, response: string, assistantsForFreshness: FlatMsg[]) => {
      const times: number[] = [];
      const pushT = (f?: FlatMsg) => {
        if (!f) return;
        const t = f.tUpdate ?? f.tCreate;
        if (typeof t === 'number' && Number.isFinite(t)) times.push(t);
      };
      pushT(user);
      if (cfg.includeToolInResponse) tools.forEach(pushT);
      assistantsForFreshness.forEach(pushT);

      const srcDate = times.length ? toDateFromSeconds(Math.max(...times)) : undefined;
      const fp = entryFingerprint({
        title: entryTitle,
        promptSummary,
        response,
        position: pos,
        chatId,
        projectId
      });

      const updateDoc: UpdateQuery<ChatEntryDoc> = {
        $set: {
          title: entryTitle,
          originalPrompt: prompt,
          promptSummary,
          response,
          source: 'chatgpt-export',
          sourceUpdatedAt: srcDate,
          exportedAt,
          fingerprint: fp, // <-- persist fingerprint
        },
      };
      await ChatEntryModel.updateOne({ entryId }, updateDoc, { upsert: true });

      upserts.push({
        filter: { entryId },
        doc: {
          entryId,
          projectId,
          chatId,
          position: pos++,
          title: entryTitle,
          originalPrompt: prompt,
          promptSummary,
          response,
          source: 'chatgpt-export',
          sourceUpdatedAt: srcDate,
          exportedAt,
          fingerprint: fp,
        },
      });
    };

    if (assistants.length === 0) {
      if (cfg.keepEmptyAssistant) mk(user.nodeId, '' + (cfg.includeToolInResponse ? toolAppendix : ''), []);
      continue;
    }

    const aTexts = assistants.map(a => (a.text || '').trim());

    switch (cfg.assistantPolicy) {
      case 'keep-first': {
        const resp = aTexts[0] + toolAppendix;
        mk(user.nodeId, resp, [assistants[0]]);
        break;
      }
      case 'keep-latest': {
        // choose the last non-empty assistant; fallback to last
        let idx = aTexts.length - 1;
        while (idx > 0 && !aTexts[idx]) idx--;
        const chosen = assistants[idx];
        const resp = (aTexts[idx] || '') + toolAppendix;
        mk(user.nodeId, resp, [chosen]);
        break;
      }
      case 'concat-all': {
        const resp = aTexts.join('\n\n---\n') + toolAppendix;
        mk(user.nodeId, resp, assistants);
        break;
      }
      case 'multi': {
        aTexts.forEach((resp, idx) => {
          mk(`${user.nodeId}#${idx + 1}`, resp + toolAppendix, [assistants[idx]]);
        });
        break;
      }
    }
  }

  return upserts;
}

type ExportConversation = {
  id: string; // chatId
  title: string;
  mapping: Record<string, ExportNode>;
  create_time?: number | string | null;
  update_time?: number | string | null;
  current_node?: string | null; // may be missing in some exports; we handle gracefully
  project: ProjectTag; // injected by apply-project-map.ts
};

/* ============================ Helpers ============================ */

function toNumberSeconds(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function toDateFromSeconds(s?: number): Date | undefined {
  if (!Number.isFinite(s as number)) return undefined;
  return new Date((s as number) * 1000);
}
function toDateOrUndefined(v: unknown): Date | undefined {
  const n = toNumberSeconds(v);
  if (n !== undefined) return new Date(n * 1000);
  if (v == null) return undefined;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? undefined : d;

}
function extractText(msg?: ExportMessage | null): string {
  if (!msg || msg.content == null) return '';
  const c: any = msg.content;

  // Newer block-array shape
  if (Array.isArray(c)) {
    const pieces: string[] = [];
    for (const b of c) {
      const typ = b?.type ?? b?.content_type;

      // Text-like blocks
      const textish =
        b?.text?.value ??
        b?.text ??
        (Array.isArray(b?.parts) ? b.parts.join('\n') : undefined);

      if (typ === 'output_text' || typ === 'input_text' || typ === 'text' || typeof textish === 'string') {
        if (textish) pieces.push(String(textish).trim());
        continue;
      }

      // Code blocks
      if (typ === 'code' || typ === 'code_block') {
        const code = b?.code ?? b?.text?.value ?? b?.text;
        const lang = b?.language ?? b?.lang ?? '';
        if (code) pieces.push(`\`\`\`${lang || ''}\n${String(code)}\n\`\`\``.trim());
        continue;
      }

      // Tool results (plain text)
      if (typ === 'tool_result' || typ === 'tool_output') {
        const t = b?.text?.value ?? b?.output ?? b?.result ?? '';
        if (t) pieces.push(String(t).trim());
        continue;
      }

      // Fallbacks
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
function firstLine(s: string): string {
  return (s ?? '').split(/\r?\n/)[0]?.trim() ?? '';
}

/* ============================ Utility ============================ */

function chunk<T>(arr: T[], size = 1000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const fresh = args.includes('--fresh');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Usage: npx ts-node src/scripts/import-conversations-to-db.ts /path/to/conversations-with-projects.json [--fresh] [--path=...] ...');
    process.exit(1);
  }
  // Apply CLI overrides to CFG
  applyCliOverrides(CFG, args);
  return { file: path.resolve(file), fresh };
}

/* ============================ Main ============================ */

async function main() {
  const { file, fresh } = parseArgs();

  const raw = await fs.readFile(file, 'utf8');
  const conversations = JSON.parse(raw) as ExportConversation[];
  if (!Array.isArray(conversations)) throw new Error('conversations-with-projects.json must be an array');

  await mongoose.connect(MONGO_URI, { dbName: process.env.MONGO_DB_NAME || undefined });
  console.log(`✅ Connected to Mongo
Importing from: ${file}
Conversations: ${conversations.length}
Fresh delete entries first: ${fresh ? 'YES' : 'NO'}
Config: ${JSON.stringify(CFG)}`);

  const now = new Date();

  // 1) Unique projects
  const projectMap = new Map<string, string>();
  for (const conv of conversations) {
    const pid = conv.project?.id ?? 'manual_unassigned';
    const pname = conv.project?.name ?? 'Unassigned';
    projectMap.set(pid, pname);
  }

  // 2) Upsert all projects
  const projectOps = Array.from(projectMap.entries()).map(([projectId, projectName]) => ({
    updateOne: {
      filter: { projectId },
      update: {
        $set: { name: projectName, lastSyncedAt: now },
        $setOnInsert: { projectId, chats: [] as any[] },
      },
      upsert: true,
    },
  }));

  if (projectOps.length) {
    const projChunks = chunk(projectOps, 500);
    for (const ops of projChunks) {
      await ProjectModel.bulkWrite(ops, { ordered: false });
    }
  }

  // Optional fresh delete of entries for these chats
  const chatIds: string[] = conversations.map((c) => c.id);
  if (fresh && chatIds.length) {
    console.log(`🧹 Deleting existing ChatEntry rows for ${chatIds.length} chats...`);
    await ChatEntryModel.deleteMany({ chatId: { $in: chatIds } });
  }

  // 3) Prepare chat pull→push and entry upserts
  type UpdateOne = { updateOne: { filter: any; update: any; upsert?: boolean } };
  const chatOps: UpdateOne[] = [];
  const entryOps: UpdateOne[] = [];

  for (const conv of conversations) {
    const chatId = conv.id;
    const projectId = conv.project?.id ?? 'manual_unassigned';
    const projectName = conv.project?.name ?? 'Unassigned';

    const msgs = orderedMessages(conv, CFG);
    const pairs = pairIntoEntries(msgs, projectId, chatId, conv.title, now, CFG);

    // Message count: count only user+assistant (ignore system/tool)
    const messageCount = msgs.filter(m => m.role === 'user' || m.role === 'assistant').length;

    // Chat subdoc with new metadata shape
    const sourceUpdatedAt =
      toDateOrUndefined(conv.update_time) ??
      toDateOrUndefined(conv.create_time);

    const chatMeta = {
      chatId,
      title: conv.title || '(Untitled)',
      projectId,
      projectName,
      messageCount,
      metadata: {
        source: 'chatgpt-export',
        exportedAt: now,
        sourceUpdatedAt,
      },
    };

    // Pull old and push new (keep order so pull precedes push)
    chatOps.push({ updateOne: { filter: { projectId }, update: { $pull: { chats: { chatId } } } } });
    chatOps.push({ updateOne: { filter: { projectId }, update: { $push: { chats: chatMeta } } } });

    // Entry upserts by entryId
    for (const { filter, doc } of pairs) {
      entryOps.push({
        updateOne: {
          filter,                     // { entryId }
          update: { $setOnInsert: doc },
          upsert: true,
        },
      });
    }
  }

  // 4) Apply chat ops
  if (chatOps.length) {
    const chatChunks = chunk(chatOps, 1000);
    for (const ops of chatChunks) {
      await ProjectModel.bulkWrite(ops, { ordered: true }); // preserve pull→push order
    }
  }

  // 5) Apply entry upserts
  let entriesInserted = 0;
  if (entryOps.length) {
    const entryChunks = chunk(entryOps, 1000);
    for (const ops of entryChunks) {
      const res: any = await ChatEntryModel.bulkWrite(ops, { ordered: false });
      entriesInserted += Number(res.upsertedCount || 0);
    }
  }

  // 6) Summary
  console.log('\n—— Import Summary ——');
  console.log(`Projects upserted:  ${projectMap.size}`);
  console.log(`Chats upserted:     ${conversations.length}`);
  console.log(`Entries inserted:   ${entriesInserted}`);

  await mongoose.disconnect();
  console.log('✅ Done.');
}

main().catch(async (err) => {
  console.error('❌ Import failed:', err);
  try { await mongoose.disconnect(); } catch { }
  process.exit(1);
});
