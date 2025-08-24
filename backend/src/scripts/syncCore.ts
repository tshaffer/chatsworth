/* backend/src/scripts/syncCore.ts */
import { ChatModel, ProjectModel } from '../models/Project';
import { ChatEntryModel } from '../models/ChatEntry';

/** ISO 8601 string */
export type ISOString = string;

/** Flattened payload produced by your fromConversations flattener */
export interface ExportPayload {
  projects: Array<{
    id: string;        // maps to ProjectModel.projectId
    name: string;
    updatedAt?: ISOString; // optional; ProjectModel lacks this today
  }>;
  chats: Array<{
    id: string;        // maps to ChatModel.chatId
    projectId: string; // maps to ChatModel.projectId
    title: string;
    updatedAt?: ISOString; // will compare to ChatModel.metadata.updated
  }>;
  entries: Array<{
    // If you later add entryId to your schema, switch to that:
    // entryId?: string;
    projectId: string;
    chatId: string;
    position: number;
    title?: string;
    originalPrompt?: string;
    promptSummary?: string;
    response?: string;
    deleted?: boolean;
    updatedAt?: ISOString;   // compare to ChatEntryModel.updatedAt
  }>;
}

/** What we print after a run */
export interface SyncSummary {
  projects: { created: number; renamed: number };
  chats: { created: number; renamed: number; movedProject: number };
  entries: {
    created: number;
    renamed: number;
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

/** DB shapes (lean results) — aligned to your schemas */
interface DbProject {
  _id?: unknown;
  projectId: string;
  name: string;
  lastSyncedAt?: Date;
}

interface DbChat {
  _id?: unknown;
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

/**
 * Core sync function. Reconciles export payload with Mongo state,
 * using your field names and indexes.
 */
export async function runBidirectionalSync(exp: ExportPayload): Promise<SyncSummary> {
  // Map export by IDs
  const expProjects = new Map(exp.projects.map(p => [p.id, p]));
  const expChats = new Map(exp.chats.map(c => [c.id, c]));

  // For entries, we will key by (chatId, position) to match your unique index.
  // If you add `entryId`, replace the key with entryId instead.
  const expEntriesByChatPos = new Map<string, ExportPayload['entries'][number]>();
  for (const e of exp.entries) {
    const key = `${e.chatId}::${e.position}`;
    expEntriesByChatPos.set(key, e);
  }

  // Load DB state (no generics on lean(); cast after exec)
  const [dbProjects, dbChats, dbEntries] = await Promise.all([
    ProjectModel.find().lean().exec() as unknown as DbProject[],
    ChatModel.find().lean().exec() as unknown as DbChat[],
    ChatEntryModel.find().lean().exec() as unknown as DbEntry[],
  ]);

  const projById = new Map<string, DbProject>(dbProjects.map(p => [String(p.projectId), p]));
  const chatById = new Map<string, DbChat>(dbChats.map(c => [String(c.chatId), c]));

  // Build a lookup for entries by (chatId, position)
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
      // Your ProjectModel doesn't track updatedAt; we can't do "newer wins".
      // Strategy: if the name differs, update it and stamp lastSyncedAt.
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
  if (projectOps.length) await ProjectModel.bulkWrite(projectOps);

  // ─────────────────────────────────────────────────────────
  // CHATS
  // ─────────────────────────────────────────────────────────
  const chatOps: Parameters<typeof ChatModel.bulkWrite>[0] = [];

  for (const [chatId, xc] of expChats) {
    const dc = chatById.get(chatId);
    const exportUpdatedIso = toIso(xc.updatedAt);

    if (!dc) {
      chatOps.push({
        updateOne: {
          filter: { chatId },
          update: {
            $setOnInsert: {
              chatId,
              title: xc.title,
              projectId: xc.projectId,
              projectName: undefined, // optional: fill if you want
              messageCount: 0,
              metadata: {
                created: exportUpdatedIso ? new Date(exportUpdatedIso) : new Date(),
                updated: exportUpdatedIso ? new Date(exportUpdatedIso) : new Date(),
                source: 'chatgpt-export',
                exportedAt: new Date(),
              },
            },
            $set: {
              title: xc.title,
              projectId: xc.projectId,
              'metadata.updated': exportUpdatedIso ? new Date(exportUpdatedIso) : new Date(),
              'metadata.exportedAt': new Date(),
            },
          },
          upsert: true,
        },
      });
      summary.chats.created += 1;
    } else {
      const dbUpdatedIso =
        toIso(dc.metadata?.updated) ||
        toIso(dc.metadata?.created);

      // Rename
      if (xc.title !== dc.title && aBeatsB(exportUpdatedIso, dbUpdatedIso)) {
        chatOps.push({
          updateOne: {
            filter: { chatId },
            update: {
              $set: {
                title: xc.title,
                'metadata.updated': exportUpdatedIso ? new Date(exportUpdatedIso) : new Date(),
                'metadata.exportedAt': new Date(),
              },
            },
          },
        });
        summary.chats.renamed += 1;
      }

      // Move to different project
      if (xc.projectId !== dc.projectId && aBeatsB(exportUpdatedIso, dbUpdatedIso)) {
        chatOps.push({
          updateOne: {
            filter: { chatId },
            update: {
              $set: {
                projectId: xc.projectId,
                'metadata.updated': exportUpdatedIso ? new Date(exportUpdatedIso) : new Date(),
                'metadata.exportedAt': new Date(),
              },
            },
          },
        });
        summary.chats.movedProject += 1;
      }
    }
  }

  if (chatOps.length) await ChatModel.bulkWrite(chatOps);

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
              deleted: xe.deleted ?? false, // only if your schema includes it
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

    // Move across project/chat
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

    // NOTE on reordering:
    // Since (chatId, position) is your unique key, "reordering" is represented by
    // entries changing their `position`. Without a stable entryId, the safest path
    // is to treat the export as authoritative for the whole chat’s ordering and
    // (optionally) run a post-pass to normalize positions. Here we only update
    // the single document’s position if export is newer and the key changed.
    if (exportWins && xe.position !== de.position) {
      // To change position safely given the unique index, we update by old key.
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

    // "Rename" (entry title) — you don't persist a separate title column today.
    // If you decide to store `title`, uncomment the following:
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

  if (entryOps.length) await ChatEntryModel.bulkWrite(entryOps);

  return summary;
}
