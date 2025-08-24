/* eslint-disable no-console */
import { ProjectModel } from '../models/Project';
import { ChatEntryModel } from '../models/ChatEntry';

/** ISO 8601 string */
export type ISOString = string;

/** Options controlling sync behavior */
export interface SyncOptions {
  dryRun?: boolean;
  /** When true, print field-level diffs (and whether they will be applied) */
  logDiffs?: boolean;
}

/** Flattened payload produced by fromConversations flattener */
export interface ExportPayload {
  projects: Array<{
    id: string;              // maps to ProjectModel.projectId
    name: string;
    updatedAt?: ISOString;   // optional; ProjectModel lacks this today
  }>;
  chats: Array<{
    id: string;              // maps to chats[].chatId
    projectId: string;       // maps to chats[].projectId
    title: string;
    updatedAt?: ISOString;   // compared to chats[].metadata.updated/sourceUpdatedAt
  }>;
  entries: Array<{
    entryId: string;         // stable id (user message id)
    projectId: string;
    chatId: string;
    position: number;
    title?: string;
    originalPrompt?: string;
    promptSummary?: string;
    response?: string;
    deleted?: boolean;
    updatedAt?: ISOString;   // from flattener: max(user/assistant/tool) timestamps
  }>;
}

/** What we print after a run */
export interface SyncSummary {
  projects: { created: number; renamed: number };
  chats: { created: number; renamed: number; movedProject: number };
  entries: {
    created: number;
    renamed: number;              // (unused today)
    movedChat: number;
    movedProject: number;
    reordered: number;
    editedPromptSummary: number;
    editedResponse: number;
    softDeleted: number;
    resurrected: number;
  };
  notes: string[];
}

/* ────────────────────────────────────────────────────────────
   DB shapes (lean results) — aligned to your schemas
   ──────────────────────────────────────────────────────────── */
interface DbChat {
  chatId: string;
  title: string;
  projectId: string;
  projectName?: string;
  messageCount?: number;
  metadata?: {
    user?: string;
    created?: Date;
    updated?: Date;          // older importer used this
    sourceUpdatedAt?: Date;  // newer importer may set this
    exportedAt?: Date;
    source?: string;
  };
}

interface DbProject {
  _id?: unknown;
  projectId: string;
  name: string;
  lastSyncedAt?: Date;
  chats: DbChat[];
}

interface DbEntry {
  _id?: unknown;
  entryId: string;           // unique
  projectId: string;
  chatId: string;
  position: number;
  originalPrompt?: string;
  promptSummary?: string;
  response?: string;
  createdAt?: Date;
  updatedAt?: Date;          // DB-side last content change
  exportedAt?: Date;
  source?: string;
  embedding?: number[];
  deleted?: boolean;
}

/* ────────────────────────────────────────────────────────────
   Utilities
   ──────────────────────────────────────────────────────────── */
function aBeatsB(a?: ISOString, b?: ISOString): boolean {
  if (!a && !b) return false;
  if (a && !b) return true;
  if (!a && b) return false;
  return new Date(a!).getTime() > new Date(b!).getTime();
}
function toIso(d?: Date | string | number | null): ISOString | undefined {
  if (d == null) return undefined;
  return new Date(d).toISOString();
}
function safePreview(v: unknown, max = 140): string {
  const s = v === undefined ? '⟂' : v === null ? '∅' : String(v);
  return s.length > max ? s.slice(0, max) + ' …' : s;
}
function logIf(enabled: boolean, ...args: any[]) {
  if (enabled) console.log(...args);
}

/* ────────────────────────────────────────────────────────────
   Main sync
   ──────────────────────────────────────────────────────────── */
export async function runBidirectionalSync(
  exp: ExportPayload,
  options: SyncOptions = {},
): Promise<SyncSummary> {
  const { dryRun = false, logDiffs = false } = options;

  // Map export by IDs
  const expProjects = new Map(exp.projects.map((p) => [p.id, p]));
  const expChats = new Map(exp.chats.map((c) => [c.id, c]));
  const expEntriesById = new Map(exp.entries.map((e) => [e.entryId, e]));

  // Load DB state
  const [dbProjects, dbEntries] = await Promise.all([
    (ProjectModel.find().lean().exec() as unknown as Promise<DbProject[]>),
    (ChatEntryModel.find().lean().exec() as unknown as Promise<DbEntry[]>),
  ]);

  // Index projects, chats, entries
  const projById = new Map<string, DbProject>(dbProjects.map((p) => [String(p.projectId), p]));

  type ChatIndexVal = { chat: DbChat; project: DbProject };
  const chatIndex = new Map<string, ChatIndexVal>();
  for (const p of dbProjects) {
    for (const c of (p.chats ?? [])) {
      chatIndex.set(String(c.chatId), { chat: c, project: p });
    }
  }

  const entryById = new Map<string, DbEntry>(dbEntries.map((d) => [String(d.entryId), d]));

  const summary: SyncSummary = {
    projects: { created: 0, renamed: 0 },
    chats: { created: 0, renamed: 0, movedProject: 0 },
    entries: {
      created: 0,
      renamed: 0,
      movedChat: 0,
      movedProject: 0,
      reordered: 0,
      editedPromptSummary: 0,
      editedResponse: 0,
      softDeleted: 0,
      resurrected: 0,
    },
    notes: [],
  };

  /* ───────────────── Projects ───────────────── */
  const projectOps: Parameters<typeof ProjectModel.bulkWrite>[0] = [];

  for (const [projectId, xp] of expProjects) {
    const dp = projById.get(projectId);
    if (!dp) {
      logIf(logDiffs, `[PROJECT][CREATE] id=${projectId} name=EXP("${xp.name}") DB(∅) APPLY`);
      projectOps.push({
        updateOne: {
          filter: { projectId },
          update: {
            $setOnInsert: { projectId, name: xp.name, chats: [] },
            $set: { name: xp.name, lastSyncedAt: new Date() },
          },
          upsert: true,
        },
      });
      summary.projects.created += 1;
    } else if (xp.name !== dp.name) {
      logIf(
        logDiffs,
        `[PROJECT][RENAME] id=${projectId} name: DB("${safePreview(dp.name)}") → EXP("${safePreview(xp.name)}") APPLY`
      );
      projectOps.push({
        updateOne: {
          filter: { projectId },
          update: { $set: { name: xp.name, lastSyncedAt: new Date() } },
        },
      });
      summary.projects.renamed += 1;
    } else {
      // stamp sync time
      projectOps.push({
        updateOne: {
          filter: { projectId },
          update: { $set: { lastSyncedAt: new Date() } },
        },
      });
    }
  }

  if (projectOps.length) {
    if (dryRun) console.log(`[dryRun] Would apply ${projectOps.length} project ops`);
    else await ProjectModel.bulkWrite(projectOps);
  }

  /* ───────────────── Chats (embedded in Project) ───────────────── */
  const chatRenameOps: Parameters<typeof ProjectModel.bulkWrite>[0] = [];
  const chatMoveOps: Parameters<typeof ProjectModel.bulkWrite>[0] = [];
  const chatCreateOps: Parameters<typeof ProjectModel.bulkWrite>[0] = [];

  for (const [chatId, xc] of expChats) {
    const hit = chatIndex.get(chatId);
    const exportUpdatedIso = toIso(xc.updatedAt);

    if (!hit) {
      logIf(
        logDiffs,
        `[CHAT][CREATE] chatId=${chatId} project: ∅ → EXP("${xc.projectId}"), title=EXP("${safePreview(xc.title)}") APPLY`
      );
      // Create new embedded chat in its project
      const newEmbeddedChat: DbChat = {
        chatId,
        title: xc.title,
        projectId: xc.projectId,
        projectName: projById.get(xc.projectId)?.name ?? '',
        messageCount: 0,
        metadata: {
          updated: exportUpdatedIso ? new Date(exportUpdatedIso) : new Date(),
          source: 'chatgpt-export',
          exportedAt: new Date(),
        },
      };

      chatCreateOps.push({
        updateOne: {
          filter: { projectId: xc.projectId },
          update: {
            $setOnInsert: { projectId: xc.projectId, name: projById.get(xc.projectId)?.name ?? 'Unnamed' },
            $push: { chats: newEmbeddedChat },
            $set: { lastSyncedAt: new Date() },
          },
          upsert: true,
        },
      });
      summary.chats.created += 1;

      const projForIndex =
        projById.get(xc.projectId) ??
        ({ projectId: xc.projectId, name: 'Unnamed', chats: [] } as DbProject);
      chatIndex.set(chatId, { chat: newEmbeddedChat, project: projForIndex });
      continue;
    }

    const { chat: dc, project: dp } = hit;
    const dbUpdatedIso =
      toIso(dc.metadata?.updated) ||
      toIso(dc.metadata?.sourceUpdatedAt) ||
      toIso(dc.metadata?.created);

    // Rename (within same project) — newer wins
    if (xc.title !== dc.title) {
      const apply = aBeatsB(exportUpdatedIso, dbUpdatedIso);
      logIf(
        logDiffs,
        `[CHAT][RENAME] chatId=${chatId} title: DB("${safePreview(dc.title)}") → EXP("${safePreview(xc.title)}") ${apply ? 'APPLY' : 'SKIP (DB newer)'}`
      );
      if (apply) {
        chatRenameOps.push({
          updateOne: {
            filter: { projectId: dp.projectId, 'chats.chatId': chatId },
            update: {
              $set: {
                'chats.$[c].title': xc.title,
                'chats.$[c].metadata.updated': exportUpdatedIso ? new Date(exportUpdatedIso) : new Date(),
                'chats.$[c].metadata.exportedAt': new Date(),
                lastSyncedAt: new Date(),
              },
            },
            arrayFilters: [{ 'c.chatId': chatId }],
          },
        });
        summary.chats.renamed += 1;
      }
    }

    // Move across projects — newer wins
    if (xc.projectId !== dp.projectId) {
      const apply = aBeatsB(exportUpdatedIso, dbUpdatedIso);
      logIf(
        logDiffs,
        `[CHAT][MOVE] chatId=${chatId} project: DB("${dp.projectId}") → EXP("${xc.projectId}") ${apply ? 'APPLY' : 'SKIP (DB newer)'}`
      );
      if (apply) {
        // Pull from old
        chatMoveOps.push({
          updateOne: {
            filter: { projectId: dp.projectId },
            update: { $pull: { chats: { chatId } }, $set: { lastSyncedAt: new Date() } },
          },
        });
        // Push into new
        const movedChat: DbChat = {
          ...dc,
          projectId: xc.projectId,
          projectName: projById.get(xc.projectId)?.name ?? dc.projectName,
          metadata: {
            ...(dc.metadata ?? {}),
            updated: exportUpdatedIso ? new Date(exportUpdatedIso) : new Date(),
            exportedAt: new Date(),
          },
        };
        chatMoveOps.push({
          updateOne: {
            filter: { projectId: xc.projectId },
            update: {
              $setOnInsert: { projectId: xc.projectId, name: projById.get(xc.projectId)?.name ?? 'Unnamed' },
              $push: { chats: movedChat },
              $set: { lastSyncedAt: new Date() },
            },
            upsert: true,
          },
        });
        summary.chats.movedProject += 1;
        chatIndex.set(chatId, { chat: movedChat, project: projById.get(xc.projectId) ?? dp });
      }
    }
  }

  if (chatRenameOps.length) {
    if (dryRun) console.log(`[dryRun] Would apply ${chatRenameOps.length} chat rename ops`);
    else await ProjectModel.bulkWrite(chatRenameOps);
  }
  if (chatMoveOps.length) {
    if (dryRun) console.log(`[dryRun] Would apply ${chatMoveOps.length} chat move ops`);
    else await ProjectModel.bulkWrite(chatMoveOps);
  }
  if (chatCreateOps.length) {
    if (dryRun) console.log(`[dryRun] Would apply ${chatCreateOps.length} chat create ops`);
    else await ProjectModel.bulkWrite(chatCreateOps);
  }

  /* ───────────────── Entries (keyed by entryId) ───────────────── */
  const entryOps: Parameters<typeof ChatEntryModel.bulkWrite>[0] = [];

  for (const [entryId, xe] of expEntriesById) {
    const de = entryById.get(entryId);
    const xIso = xe.updatedAt;
    const dIso = de?.updatedAt ? new Date(de.updatedAt).toISOString() : undefined;
    const exportWins = aBeatsB(xIso, dIso);

    if (!de) {
      logIf(
        logDiffs,
        `[ENTRY][CREATE] entryId=${entryId} chatId=${xe.chatId} pos=${xe.position} APPLY`
      );
      // Create
      entryOps.push({
        updateOne: {
          filter: { entryId },
          update: {
            $setOnInsert: {
              entryId,
              projectId: xe.projectId,
              chatId: xe.chatId,
              position: xe.position,
              originalPrompt: xe.originalPrompt ?? '',
              promptSummary: xe.promptSummary ?? '',
              response: xe.response ?? '',
              deleted: !!xe.deleted,
              createdAt: xIso ? new Date(xIso) : new Date(),
              source: 'chatgpt-export',
            },
            $set: {
              updatedAt: xIso ? new Date(xIso) : new Date(),
              exportedAt: new Date(),
            },
          },
          upsert: true,
        },
      });
      summary.entries.created += 1;
      continue;
    }

    // Field-by-field diff report (even if DB is newer, we still log it)
    type Diff = { field: string; db: unknown; exp: unknown; apply: boolean; reason?: string };
    const diffs: Diff[] = [];

    const pushDiff = (field: string, dbVal: any, expVal: any, applyForThis = exportWins) => {
      if (expVal !== dbVal) {
        diffs.push({
          field,
          db: dbVal,
          exp: expVal,
          apply: !!applyForThis,
          reason: applyForThis ? 'export newer' : 'DB newer',
        });
      }
    };

    pushDiff('projectId', de.projectId, xe.projectId);
    pushDiff('chatId', de.chatId, xe.chatId);
    pushDiff('position', de.position, xe.position);
    if (xe.promptSummary !== undefined) pushDiff('promptSummary', de.promptSummary ?? '', xe.promptSummary ?? '');
    if (xe.response !== undefined)      pushDiff('response',      de.response ?? '',      xe.response ?? '');
    if (typeof xe.deleted === 'boolean') pushDiff('deleted', !!de.deleted, !!xe.deleted);

    if (diffs.length) {
      for (const d of diffs) {
        logIf(
          logDiffs,
          `[ENTRY][DIFF] entryId=${entryId} ${d.field}: DB("${safePreview(d.db)}") → EXP("${safePreview(d.exp)}") ${d.apply ? 'APPLY' : 'SKIP (DB newer)'}`
        );
      }
    }

    if (!exportWins) continue;

    // Apply newer-wins updates
    const set: Record<string, any> = {
      updatedAt: xIso ? new Date(xIso) : new Date(),
      exportedAt: new Date(),
    };

    if (xe.projectId !== de.projectId) { set.projectId = xe.projectId; summary.entries.movedProject += 1; }
    if (xe.chatId !== de.chatId)       { set.chatId   = xe.chatId;    summary.entries.movedChat += 1; }
    if (xe.position !== de.position)   { set.position = xe.position;  summary.entries.reordered += 1; }
    if (xe.promptSummary !== undefined && xe.promptSummary !== de.promptSummary) {
      set.promptSummary = xe.promptSummary ?? '';
      summary.entries.editedPromptSummary += 1;
    }
    if (xe.response !== undefined && xe.response !== de.response) {
      set.response = xe.response ?? '';
      summary.entries.editedResponse += 1;
    }
    if (typeof xe.deleted === 'boolean' && xe.deleted !== !!de.deleted) {
      set.deleted = xe.deleted;
      if (xe.deleted) summary.entries.softDeleted += 1;
      else summary.entries.resurrected += 1;
    }

    entryOps.push({
      updateOne: { filter: { entryId }, update: { $set: set } },
    });
  }

  // Diagnostics: DB-only entries (not present in export)
  for (const [id, de] of entryById) {
    if (!expEntriesById.has(id) && !de.deleted) {
      const note = `DB-only entry not in export: entryId=${id} chatId=${de.chatId} position=${de.position}`;
      summary.notes.push(note);
      logIf(logDiffs, `[ENTRY][MISSING_IN_EXPORT] ${note}`);
    }
  }

  if (entryOps.length) {
    if (dryRun) console.log(`[dryRun] Would apply ${entryOps.length} entry ops`);
    else await ChatEntryModel.bulkWrite(entryOps);
  }

  return summary;
}
