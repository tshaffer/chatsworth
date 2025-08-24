/* backend/src/scripts/syncCore.ts */
/* eslint-disable no-console */
import { ProjectModel } from '../models/Project';
import { ChatEntryModel } from '../models/ChatEntry';

/** ISO 8601 string */
export type ISOString = string;

/** Options controlling sync behavior */
export interface SyncOptions {
  dryRun?: boolean;
}

/** Flattened payload produced by your fromConversations flattener */
export interface ExportPayload {
  projects: Array<{
    id: string;        // maps to ProjectModel.projectId
    name: string;
    updatedAt?: ISOString; // optional; ProjectModel lacks this today
  }>;
  chats: Array<{
    id: string;        // maps to chats[].chatId
    projectId: string; // maps to chats[].projectId
    title: string;
    updatedAt?: ISOString; // compared to chats[].metadata.updated
  }>;
  entries: Array<{
    projectId: string;
    chatId: string;
    position: number;
    title?: string;           // not persisted in your schema (kept for future)
    originalPrompt?: string;
    promptSummary?: string;
    response?: string;
    deleted?: boolean;        // only used if you add it to schema
    updatedAt?: ISOString;    // compared to ChatEntry.updatedAt
  }>;
}

/** What we print after a run */
export interface SyncSummary {
  projects: { created: number; renamed: number };
  chats: { created: number; renamed: number; movedProject: number };
  entries: {
    created: number;
    renamed: number;              // (no-op today unless you store title)
    movedChat: number;            // export says different chatId
    movedProject: number;         // export says different projectId
    reordered: number;            // position changed (see note)
    editedPromptSummary: number;
    editedResponse: number;
    softDeleted: number;
    resurrected: number;
  };
  notes: string[];
}

/** DB shapes (lean results) — aligned to your schemas */
interface DbChat {
  chatId: string;
  title: string;
  projectId: string;
  projectName?: string;
  messageCount?: number;
  metadata?: {
    user?: string;
    created?: Date;
    updated?: Date;
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
  projectId: string;
  chatId: string;
  position: number;
  originalPrompt?: string;
  promptSummary?: string;
  response?: string;
  createdAt?: Date;
  updatedAt?: Date;
  exportedAt?: Date;
  source?: string;
  embedding?: number[];
  deleted?: boolean; // optional: only if you add it
}

/** Compare by timestamp (undefined is oldest) */
function aBeatsB(a?: ISOString, b?: ISOString): boolean {
  if (!a && !b) return false;
  if (a && !b) return true;
  if (!a && b) return false;
  return new Date(a!).getTime() > new Date(b!).getTime();
}

/** Normalize unknown date-ish values to ISO string */
function toIso(d?: Date | string | number | null): ISOString | undefined {
  if (d == null) return undefined;
  return new Date(d).toISOString();
}

export async function runBidirectionalSync(
  exp: ExportPayload,
  options: SyncOptions = {},
): Promise<SyncSummary> {
  const { dryRun = false } = options;

  // Map export by IDs
  const expProjects = new Map(exp.projects.map(p => [p.id, p]));
  const expChats = new Map(exp.chats.map(c => [c.id, c]));

  // For entries, key by (chatId, position) to match your unique index
  const expEntriesByChatPos = new Map<string, ExportPayload['entries'][number]>();
  for (const e of exp.entries) {
    expEntriesByChatPos.set(`${e.chatId}::${e.position}`, e);
  }

  // Load DB state
  const [dbProjects, dbEntries] = await Promise.all([
    ProjectModel.find().lean().exec() as unknown as DbProject[],
    ChatEntryModel.find().lean().exec() as unknown as DbEntry[],
  ]);

  const projById = new Map<string, DbProject>(dbProjects.map(p => [String(p.projectId), p]));

  // Build chat index: chatId -> (chat, project)
  type ChatIndexVal = { chat: DbChat; project: DbProject };
  const chatIndex = new Map<string, ChatIndexVal>();
  for (const p of dbProjects) {
    for (const c of (p.chats ?? [])) {
      chatIndex.set(String(c.chatId), { chat: c, project: p });
    }
  }

  // Build entry index by (chatId, position)
  const entryByChatPos = new Map<string, DbEntry>();
  for (const de of dbEntries) {
    entryByChatPos.set(`${de.chatId}::${de.position}`, de);
  }

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

  // ─────────────────────────────────────────────────────────
  // PROJECTS
  // ─────────────────────────────────────────────────────────
  const projectOps: Parameters<typeof ProjectModel.bulkWrite>[0] = [];

  for (const [projectId, xp] of expProjects) {
    const dp = projById.get(projectId);
    if (!dp) {
      projectOps.push({
        updateOne: {
          filter: { projectId },
          update: {
            $setOnInsert: {
              projectId,
              name: xp.name,
              lastSyncedAt: new Date(),
            },
            $set: {
              name: xp.name,
              lastSyncedAt: new Date(),
            },
          },
          upsert: true,
        },
      });
      summary.projects.created += 1;
    } else {
      // Your ProjectModel doesn't track updatedAt; update name if different
      if (xp.name !== dp.name) {
        projectOps.push({
          updateOne: {
            filter: { projectId },
            update: { $set: { name: xp.name, lastSyncedAt: new Date() } },
          },
        });
        summary.projects.renamed += 1;
      } else {
        // still stamp sync time
        projectOps.push({
          updateOne: {
            filter: { projectId },
            update: { $set: { lastSyncedAt: new Date() } },
          },
        });
      }
    }
  }

  if (projectOps.length) {
    if (dryRun) console.log(`[dryRun] Would apply ${projectOps.length} project ops`);
    else await ProjectModel.bulkWrite(projectOps);
  }

  // ─────────────────────────────────────────────────────────
  // CHATS (embedded in Project)
  // ─────────────────────────────────────────────────────────
  const chatRenameOps: Parameters<typeof ProjectModel.bulkWrite>[0] = [];
  const chatMoveOps: Parameters<typeof ProjectModel.bulkWrite>[0] = [];
  const chatCreateOps: Parameters<typeof ProjectModel.bulkWrite>[0] = [];

  for (const [chatId, xc] of expChats) {
    const hit = chatIndex.get(chatId);
    const exportUpdatedIso = toIso(xc.updatedAt);

    if (!hit) {
      // Chat doesn't exist in DB → create inside its project
      const newEmbeddedChat: DbChat = {
        chatId,
        title: xc.title,
        projectId: xc.projectId,
        projectName: projById.get(xc.projectId)?.name ?? '',
        messageCount: 0,
        metadata: {
          created: exportUpdatedIso ? new Date(exportUpdatedIso) : new Date(),
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

      // Update in-memory index so later passes see it
      const projForIndex = projById.get(xc.projectId) ?? {
        projectId: xc.projectId,
        name: projById.get(xc.projectId)?.name ?? 'Unnamed',
        chats: [],
      } as DbProject;
      chatIndex.set(chatId, { chat: newEmbeddedChat, project: projForIndex });
      continue;
    }

    const { chat: dc, project: dp } = hit;
    const dbUpdatedIso = toIso(dc.metadata?.updated) || toIso(dc.metadata?.created);

    // Rename (within current project)
    if (xc.title !== dc.title && aBeatsB(exportUpdatedIso, dbUpdatedIso)) {
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

    // Move to different project
    if (xc.projectId !== dp.projectId && aBeatsB(exportUpdatedIso, dbUpdatedIso)) {
      // 1) Pull from old project
      chatMoveOps.push({
        updateOne: {
          filter: { projectId: dp.projectId },
          update: { $pull: { chats: { chatId } }, $set: { lastSyncedAt: new Date() } },
        },
      });

      // 2) Push into new project
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

      // Update in-memory index for any subsequent ops
      chatIndex.set(chatId, { chat: movedChat, project: projById.get(xc.projectId) ?? dp });
    }
  }

  if (chatRenameOps.length) {
    if (dryRun) console.log(`[dryRun] Would apply ${chatRenameOps.length} embedded chat rename ops`);
    else await ProjectModel.bulkWrite(chatRenameOps);
  }
  if (chatMoveOps.length) {
    if (dryRun) console.log(`[dryRun] Would apply ${chatMoveOps.length} embedded chat move ops`);
    else await ProjectModel.bulkWrite(chatMoveOps);
  }
  if (chatCreateOps.length) {
    if (dryRun) console.log(`[dryRun] Would apply ${chatCreateOps.length} embedded chat create ops`);
    else await ProjectModel.bulkWrite(chatCreateOps);
  }

  // ─────────────────────────────────────────────────────────
  // ENTRIES (keyed by chatId+position)
  // ─────────────────────────────────────────────────────────
  const entryOps: Parameters<typeof ChatEntryModel.bulkWrite>[0] = [];

  // a) Upsert/Update entries present in export
  for (const [key, xe] of expEntriesByChatPos) {
    const de = entryByChatPos.get(key);
    const exportUpdatedIso = toIso(xe.updatedAt);

    if (!de) {
      // Create
      entryOps.push({
        updateOne: {
          filter: { chatId: xe.chatId, position: xe.position },
          update: {
            $setOnInsert: {
              projectId: xe.projectId,
              chatId: xe.chatId,
              position: xe.position,
              originalPrompt: xe.originalPrompt ?? '',
              promptSummary: xe.promptSummary ?? '',
              response: xe.response ?? '',
              ...(typeof xe.deleted === 'boolean' ? { deleted: xe.deleted } : {}),
              createdAt: exportUpdatedIso ? new Date(exportUpdatedIso) : new Date(),
              source: 'chatgpt-export',
            },
            $set: {
              projectId: xe.projectId,
              originalPrompt: xe.originalPrompt ?? '',
              promptSummary: xe.promptSummary ?? '',
              response: xe.response ?? '',
              ...(typeof xe.deleted === 'boolean' ? { deleted: xe.deleted } : {}),
              updatedAt: exportUpdatedIso ? new Date(exportUpdatedIso) : new Date(),
              exportedAt: new Date(),
            },
          },
          upsert: true,
        },
      });
      summary.entries.created += 1;
      continue;
    }

    const dbUpdatedIso = toIso(de.updatedAt);
    const exportWins = aBeatsB(exportUpdatedIso, dbUpdatedIso);

    // Move across project/chat (rare without entryId, but respect export fields)
    if (exportWins && (xe.projectId !== de.projectId || xe.chatId !== de.chatId)) {
      if (xe.projectId !== de.projectId) summary.entries.movedProject += 1;
      if (xe.chatId !== de.chatId) summary.entries.movedChat += 1;
      entryOps.push({
        updateOne: {
          filter: { chatId: de.chatId, position: de.position },
          update: {
            $set: {
              projectId: xe.projectId,
              chatId: xe.chatId,
              updatedAt: exportUpdatedIso ? new Date(exportUpdatedIso) : new Date(),
              exportedAt: new Date(),
            },
          },
        },
      });
    }

    // Reorder (position change)
    if (exportWins && xe.position !== de.position) {
      // update by old key; unique index (chatId,position) applies
      entryOps.push({
        updateOne: {
          filter: { chatId: de.chatId, position: de.position },
          update: {
            $set: {
              position: xe.position,
              updatedAt: exportUpdatedIso ? new Date(exportUpdatedIso) : new Date(),
              exportedAt: new Date(),
            },
          },
        },
      });
      summary.entries.reordered += 1;
    }

    // "Rename" (title) — not stored today; keep code commented for future
    /*
    if (exportWins && xe.title !== undefined && xe.title !== de.title) {
      entryOps.push({
        updateOne: {
          filter: { chatId: de.chatId, position: de.position },
          update: {
            $set: { title: xe.title ?? '', updatedAt: exportUpdatedIso ? new Date(exportUpdatedIso) : new Date(), exportedAt: new Date() },
          },
        },
      });
      summary.entries.renamed += 1;
    }
    */

    // Content edits
    if (exportWins && xe.promptSummary !== undefined && xe.promptSummary !== de.promptSummary) {
      entryOps.push({
        updateOne: {
          filter: { chatId: de.chatId, position: de.position },
          update: {
            $set: {
              promptSummary: xe.promptSummary ?? '',
              updatedAt: exportUpdatedIso ? new Date(exportUpdatedIso) : new Date(),
              exportedAt: new Date(),
            },
          },
        },
      });
      summary.entries.editedPromptSummary += 1;
    }

    if (exportWins && xe.response !== undefined && xe.response !== de.response) {
      entryOps.push({
        updateOne: {
          filter: { chatId: de.chatId, position: de.position },
          update: {
            $set: {
              response: xe.response ?? '',
              updatedAt: exportUpdatedIso ? new Date(exportUpdatedIso) : new Date(),
              exportedAt: new Date(),
            },
          },
        },
      });
      summary.entries.editedResponse += 1;
    }

    // Deletion state (soft delete) if you add `deleted` to your schema
    if (typeof xe.deleted === 'boolean' && xe.deleted !== !!de.deleted) {
      if (exportWins) {
        entryOps.push({
          updateOne: {
            filter: { chatId: de.chatId, position: de.position },
            update: {
              $set: {
                deleted: xe.deleted,
                updatedAt: exportUpdatedIso ? new Date(exportUpdatedIso) : new Date(),
                exportedAt: new Date(),
              },
            },
          },
        });
        if (xe.deleted) summary.entries.softDeleted += 1;
        else summary.entries.resurrected += 1;
      }
    }
  }

  // b) DB-only entries not present in export (diagnostics)
  for (const [key, de] of entryByChatPos) {
    if (!expEntriesByChatPos.has(key) && !de.deleted) {
      summary.notes.push(`DB-only entry not in export: chatId=${de.chatId}, position=${de.position}`);
    }
  }

  if (entryOps.length) {
    if (dryRun) console.log(`[dryRun] Would apply ${entryOps.length} entry ops`);
    else await ChatEntryModel.bulkWrite(entryOps);
  }

  return summary;
}
