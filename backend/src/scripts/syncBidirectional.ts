/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import fs from 'fs/promises';
import mongoose from 'mongoose';
import { connectDB } from '../db/connectDB';

// ----- Import your models -----
import { ProjectModel } from '../models/Project';
import { ChatModel } from '../models/Chat';
import { ChatEntryModel } from '../models/ChatEntry';

// ----- Types assumed from your normalized export -----
type ISODate = string;

type ExportProject = {
  id: string;
  name: string;
  updatedAt?: ISODate;
};

type ExportChat = {
  id: string;
  projectId: string;
  title: string;
  updatedAt?: ISODate;
};

type ExportEntry = {
  id: string;
  projectId: string;
  chatId: string;
  position: number;
  title?: string;                 // “rename” of entry
  originalPrompt?: string;
  promptSummary?: string;         // edited in Chatsworth
  response?: string;              // edited in Chatsworth
  deleted?: boolean;              // deleted at source (if your prep step sets this)
  updatedAt?: ISODate;
};

type ExportPayload = {
  projects: ExportProject[];
  chats: ExportChat[];
  entries: ExportEntry[];
};

// ----- Helper: parse args -----
/**
 * Usage:
 *  tsx src/scripts/syncBidirectional.ts /absolute/path/to/preparedExport.json
 * or
 *  node dist/scripts/syncBidirectional.js /absolute/path/to/preparedExport.json
 */
function requireArgFile(): string {
  const p = process.argv[2];
  if (!p) {
    console.error('ERROR: Provide path to prepared export JSON.');
    process.exit(1);
  }
  return path.resolve(p);
}

// ----- Merge policy (centralized) -----
/**
 * Return true if sourceA should win over sourceB based on updatedAt.
 * Undefined updatedAt is treated as the oldest possible time.
 */
function aBeatsB(a?: ISODate, b?: ISODate): boolean {
  if (!a && !b) return false; // tie -> do nothing
  if (a && !b) return true;
  if (!a && b) return false;
  return new Date(a!).getTime() > new Date(b!).getTime();
}

// For concise diffs
function isDifferent(a: any, b: any): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

// ----- Main -----
(async () => {
  const exportFile = requireArgFile();
  await connectDB();

  // 1) Load export
  const raw = await fs.readFile(exportFile, 'utf-8');
  const exp: ExportPayload = JSON.parse(raw);

  // Build maps for fast lookup
  const expProjects = new Map(exp.projects.map(p => [p.id, p]));
  const expChats = new Map(exp.chats.map(c => [c.id, c]));
  const expEntries = new Map(exp.entries.map(e => [e.id, e]));

  // 2) Load DB
  const [dbProjects, dbChats, dbEntries] = await Promise.all([
    ProjectModel.find().lean(),
    ChatModel.find().lean(),
    ChatEntryModel.find().lean(),
  ]);

  const projById = new Map(dbProjects.map((p: any) => [String(p.id ?? p._id), p]));
  const chatById = new Map(dbChats.map((c: any) => [String(c.id ?? c._id), c]));
  const entryById = new Map(dbEntries.map((e: any) => [String(e.id ?? e._id), e]));

  // For reporting
  const summary = {
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
      resurrected: 0, // if export newer & db had deleted=false/true mismatch
    },
    notes: [] as string[],
  };

  // 3) PROJECTS — create missing from export; rename by newer source
  const projectOps: any[] = [];

  // a) New or rename based on recency
  for (const [id, xp] of expProjects) {
    const dp = projById.get(id);
    if (!dp) {
      projectOps.push({
        updateOne: {
          filter: { id },
          update: {
            $setOnInsert: {
              id,
              name: xp.name,
              createdAt: new Date(),
            },
            $set: {
              name: xp.name,
              updatedAt: xp.updatedAt ? new Date(xp.updatedAt) : new Date(),
            },
          },
          upsert: true,
        },
      });
      summary.projects.created += 1;
    } else {
      // Rename if export newer than DB
      const dbUpdated = dp.updatedAt ? new Date(dp.updatedAt).toISOString() : undefined;
      if (xp.name !== dp.name && aBeatsB(xp.updatedAt, dbUpdated)) {
        projectOps.push({
          updateOne: {
            filter: { id },
            update: {
              $set: {
                name: xp.name,
                updatedAt: xp.updatedAt ? new Date(xp.updatedAt) : new Date(),
              },
            },
          },
        });
        summary.projects.renamed += 1;
      }
    }
  }

  // NOTE: We do not auto-delete projects missing from export (they may be app-only).
  if (projectOps.length) await ProjectModel.bulkWrite(projectOps);

  // 4) CHATS — create missing; rename/move by newer source
  const chatOps: any[] = [];

  for (const [chatId, xc] of expChats) {
    const dc = chatById.get(chatId);
    if (!dc) {
      chatOps.push({
        updateOne: {
          filter: { id: chatId },
          update: {
            $setOnInsert: {
              id: chatId,
              projectId: xc.projectId,
              title: xc.title,
              createdAt: new Date(),
            },
            $set: {
              projectId: xc.projectId,
              title: xc.title,
              updatedAt: xc.updatedAt ? new Date(xc.updatedAt) : new Date(),
            },
          },
          upsert: true,
        },
      });
      summary.chats.created += 1;
    } else {
      const dbUpdated = dc.updatedAt ? new Date(dc.updatedAt).toISOString() : undefined;

      // Rename
      if (xc.title !== dc.title && aBeatsB(xc.updatedAt, dbUpdated)) {
        chatOps.push({
          updateOne: {
            filter: { id: chatId },
            update: { $set: { title: xc.title, updatedAt: xc.updatedAt ? new Date(xc.updatedAt) : new Date() } },
          },
        });
        summary.chats.renamed += 1;
      }
      // Move to different project (if export newer)
      if (xc.projectId !== dc.projectId && aBeatsB(xc.updatedAt, dbUpdated)) {
        chatOps.push({
          updateOne: {
            filter: { id: chatId },
            update: { $set: { projectId: xc.projectId, updatedAt: xc.updatedAt ? new Date(xc.updatedAt) : new Date() } },
          },
        });
        summary.chats.movedProject += 1;
      }
    }
  }

  if (chatOps.length) await ChatModel.bulkWrite(chatOps);

  // 5) ENTRIES — full set of supported changes
  const entryOps: any[] = [];

  // a) Ensure entries that exist in export are present/updated in DB
  for (const [entryId, xe] of expEntries) {
    const de = entryById.get(entryId);
    if (!de) {
      // create new (from chatGPT.com)
      entryOps.push({
        updateOne: {
          filter: { id: entryId },
          update: {
            $setOnInsert: {
              id: entryId,
              projectId: xe.projectId,
              chatId: xe.chatId,
              position: xe.position,
              title: xe.title ?? '',
              originalPrompt: xe.originalPrompt ?? '',
              promptSummary: xe.promptSummary ?? '',
              response: xe.response ?? '',
              deleted: !!xe.deleted,
              createdAt: new Date(),
            },
            $set: {
              projectId: xe.projectId,
              chatId: xe.chatId,
              position: xe.position,
              title: xe.title ?? '',
              originalPrompt: xe.originalPrompt ?? '',
              promptSummary: xe.promptSummary ?? '',
              response: xe.response ?? '',
              deleted: !!xe.deleted,
              updatedAt: xe.updatedAt ? new Date(xe.updatedAt) : new Date(),
            },
          },
          upsert: true,
        },
      });
      summary.entries.created += 1;
      continue;
    }

    // For entries present in both: field-level reconciliation by recency
    const dbUpdated = de.updatedAt ? new Date(de.updatedAt).toISOString() : undefined;
    const exportWins = aBeatsB(xe.updatedAt, dbUpdated);

    // Move across project/chat
    if (exportWins && (xe.projectId !== de.projectId || xe.chatId !== de.chatId)) {
      if (xe.projectId !== de.projectId) summary.entries.movedProject += 1;
      if (xe.chatId !== de.chatId) summary.entries.movedChat += 1;
      entryOps.push({
        updateOne: {
          filter: { id: entryId },
          update: {
            $set: {
              projectId: xe.projectId,
              chatId: xe.chatId,
              updatedAt: xe.updatedAt ? new Date(xe.updatedAt) : new Date(),
            },
          },
        },
      });
    }

    // Reorder within chat
    if (exportWins && xe.position !== de.position) {
      entryOps.push({
        updateOne: {
          filter: { id: entryId },
          update: {
            $set: { position: xe.position, updatedAt: xe.updatedAt ? new Date(xe.updatedAt) : new Date() },
          },
        },
      });
      summary.entries.reordered += 1;
    }

    // Rename (entry title)
    if (exportWins && xe.title !== undefined && xe.title !== de.title) {
      entryOps.push({
        updateOne: {
          filter: { id: entryId },
          update: { $set: { title: xe.title ?? '', updatedAt: xe.updatedAt ? new Date(xe.updatedAt) : new Date() } },
        },
      });
      summary.entries.renamed += 1;
    }

    // Content edits
    if (exportWins && xe.promptSummary !== undefined && xe.promptSummary !== de.promptSummary) {
      entryOps.push({
        updateOne: {
          filter: { id: entryId },
          update: {
            $set: { promptSummary: xe.promptSummary ?? '', updatedAt: xe.updatedAt ? new Date(xe.updatedAt) : new Date() },
          },
        },
      });
      summary.entries.editedPromptSummary += 1;
    }

    if (exportWins && xe.response !== undefined && xe.response !== de.response) {
      entryOps.push({
        updateOne: {
          filter: { id: entryId },
          update: {
            $set: { response: xe.response ?? '', updatedAt: xe.updatedAt ? new Date(xe.updatedAt) : new Date() },
          },
        },
      });
      summary.entries.editedResponse += 1;
    }

    // Deletion state
    if (xe.deleted !== undefined && xe.deleted !== de.deleted) {
      if (exportWins) {
        entryOps.push({
          updateOne: {
            filter: { id: entryId },
            update: {
              $set: { deleted: !!xe.deleted, updatedAt: xe.updatedAt ? new Date(xe.updatedAt) : new Date() },
            },
          },
        });
        if (xe.deleted) summary.entries.softDeleted += 1;
        else summary.entries.resurrected += 1;
      }
    }
  }

  // b) Entries that exist only in DB:
  //    - Keep them (they might be app-only, or newer app edits).
  //    - If your pipeline marks export-deleted entries explicitly, the loop above already handled them.
  //    - Optionally, flag items that have never appeared in export (for operator review).
  for (const [entryId, de] of entryById) {
    if (!expEntries.has(entryId) && !de.deleted) {
      // Optional diagnostic
      summary.notes.push(`DB-only entry not in export: ${entryId} (chatId=${de.chatId})`);
    }
  }

  if (entryOps.length) await ChatEntryModel.bulkWrite(entryOps);

  // 6) Post-pass: ensure position arrays are dense per chat (optional but nice to keep tidy)
  //    If you allow arbitrary inserts, you can renormalize positions here. Skipping for now.

  // 7) Report
  console.log('=== Sync Summary ===');
  console.log(JSON.stringify(summary, null, 2));

  await mongoose.disconnect();
  process.exit(0);
})().catch(async (err) => {
  console.error('Sync failed:', err);
  try { await mongoose.disconnect(); } catch { }
  process.exit(1);
});
