/* eslint-disable no-console */
import { ProjectModel } from '../models/Project';
import { ChatModel } from '../models/Chat';
import { ChatEntryModel } from '../models/ChatEntry';

export type ExportPayload = {
  projects: Array<{ id: string; name: string; updatedAt?: string }>;
  chats: Array<{ id: string; projectId: string; title: string; updatedAt?: string }>;
  entries: Array<{
    id: string;
    projectId: string;
    chatId: string;
    position: number;
    title?: string;
    originalPrompt?: string;
    promptSummary?: string;
    response?: string;
    deleted?: boolean;
    updatedAt?: string;
  }>;
};

type Summary = {
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
};

function aBeatsB(a?: string, b?: string): boolean {
  if (!a && !b) return false;
  if (a && !b) return true;
  if (!a && b) return false;
  return new Date(a!).getTime() > new Date(b!).getTime();
}

export async function runBidirectionalSync(exp: ExportPayload): Promise<Summary> {
  const expProjects = new Map(exp.projects.map(p => [p.id, p]));
  const expChats = new Map(exp.chats.map(c => [c.id, c]));
  const expEntries = new Map(exp.entries.map(e => [e.id, e]));

  const [dbProjects, dbChats, dbEntries] = await Promise.all([
    ProjectModel.find().lean(),
    ChatModel.find().lean(),
    ChatEntryModel.find().lean(),
  ]);

  const projById = new Map(dbProjects.map((p: any) => [String(p.id ?? p._id), p]));
  const chatById = new Map(dbChats.map((c: any) => [String(c.id ?? c._id), c]));
  const entryById = new Map(dbEntries.map((e: any) => [String(e.id ?? e._id), e]));

  const summary: Summary = {
    projects: { created: 0, renamed: 0 },
    chats: { created: 0, renamed: 0, movedProject: 0 },
    entries: {
      created: 0, renamed: 0, movedChat: 0, movedProject: 0, reordered: 0,
      editedPromptSummary: 0, editedResponse: 0, softDeleted: 0, resurrected: 0
    },
    notes: [],
  };

  // PROJECTS
  const projectOps: any[] = [];
  for (const [id, xp] of expProjects) {
    const dp = projById.get(id);
    if (!dp) {
      projectOps.push({
        updateOne: {
          filter: { id },
          update: {
            $setOnInsert: { id, name: xp.name, createdAt: new Date() },
            $set: { name: xp.name, updatedAt: xp.updatedAt ? new Date(xp.updatedAt) : new Date() },
          },
          upsert: true,
        },
      });
      summary.projects.created += 1;
    } else {
      const dbUpdated = dp.updatedAt ? new Date(dp.updatedAt).toISOString() : undefined;
      if (xp.name !== dp.name && aBeatsB(xp.updatedAt, dbUpdated)) {
        projectOps.push({
          updateOne: { filter: { id }, update: { $set: { name: xp.name, updatedAt: xp.updatedAt ? new Date(xp.updatedAt) : new Date() } } },
        });
        summary.projects.renamed += 1;
      }
    }
  }
  if (projectOps.length) await ProjectModel.bulkWrite(projectOps);

  // CHATS
  const chatOps: any[] = [];
  for (const [chatId, xc] of expChats) {
    const dc = chatById.get(chatId);
    if (!dc) {
      chatOps.push({
        updateOne: {
          filter: { id: chatId },
          update: {
            $setOnInsert: { id: chatId, projectId: xc.projectId, title: xc.title, createdAt: new Date() },
            $set: { projectId: xc.projectId, title: xc.title, updatedAt: xc.updatedAt ? new Date(xc.updatedAt) : new Date() },
          },
          upsert: true,
        },
      });
      summary.chats.created += 1;
    } else {
      const dbUpdated = dc.updatedAt ? new Date(dc.updatedAt).toISOString() : undefined;
      if (xc.title !== dc.title && aBeatsB(xc.updatedAt, dbUpdated)) {
        chatOps.push({ updateOne: { filter: { id: chatId }, update: { $set: { title: xc.title, updatedAt: xc.updatedAt ? new Date(xc.updatedAt) : new Date() } } } });
        summary.chats.renamed += 1;
      }
      if (xc.projectId !== dc.projectId && aBeatsB(xc.updatedAt, dbUpdated)) {
        chatOps.push({ updateOne: { filter: { id: chatId }, update: { $set: { projectId: xc.projectId, updatedAt: xc.updatedAt ? new Date(xc.updatedAt) : new Date() } } } });
        summary.chats.movedProject += 1;
      }
    }
  }
  if (chatOps.length) await ChatModel.bulkWrite(chatOps);

  // ENTRIES
  const entryOps: any[] = [];
  for (const [entryId, xe] of expEntries) {
    const de = entryById.get(entryId);
    if (!de) {
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

    const dbUpdated = de.updatedAt ? new Date(de.updatedAt).toISOString() : undefined;
    const exportWins = aBeatsB(xe.updatedAt, dbUpdated);

    if (exportWins && (xe.projectId !== de.projectId || xe.chatId !== de.chatId)) {
      if (xe.projectId !== de.projectId) summary.entries.movedProject += 1;
      if (xe.chatId !== de.chatId) summary.entries.movedChat += 1;
      entryOps.push({ updateOne: { filter: { id: entryId }, update: { $set: { projectId: xe.projectId, chatId: xe.chatId, updatedAt: xe.updatedAt ? new Date(xe.updatedAt) : new Date() } } } });
    }

    if (exportWins && xe.position !== de.position) {
      entryOps.push({ updateOne: { filter: { id: entryId }, update: { $set: { position: xe.position, updatedAt: xe.updatedAt ? new Date(xe.updatedAt) : new Date() } } } });
      summary.entries.reordered += 1;
    }

    if (exportWins && xe.title !== undefined && xe.title !== de.title) {
      entryOps.push({ updateOne: { filter: { id: entryId }, update: { $set: { title: xe.title ?? '', updatedAt: xe.updatedAt ? new Date(xe.updatedAt) : new Date() } } } });
      summary.entries.renamed += 1;
    }

    if (exportWins && xe.promptSummary !== undefined && xe.promptSummary !== de.promptSummary) {
      entryOps.push({ updateOne: { filter: { id: entryId }, update: { $set: { promptSummary: xe.promptSummary ?? '', updatedAt: xe.updatedAt ? new Date(xe.updatedAt) : new Date() } } } });
      summary.entries.editedPromptSummary += 1;
    }

    if (exportWins && xe.response !== undefined && xe.response !== de.response) {
      entryOps.push({ updateOne: { filter: { id: entryId }, update: { $set: { response: xe.response ?? '', updatedAt: xe.updatedAt ? new Date(xe.updatedAt) : new Date() } } } });
      summary.entries.editedResponse += 1;
    }

    if (xe.deleted !== undefined && xe.deleted !== de.deleted) {
      if (exportWins) {
        entryOps.push({ updateOne: { filter: { id: entryId }, update: { $set: { deleted: !!xe.deleted, updatedAt: xe.updatedAt ? new Date(xe.updatedAt) : new Date() } } } });
        if (xe.deleted) summary.entries.softDeleted += 1; else summary.entries.resurrected += 1;
      }
    }
  }

  for (const [entryId, de] of entryById) {
    if (!expEntries.has(entryId) && !de.deleted) {
      summary.notes.push(`DB-only entry not in export: ${entryId} (chatId=${de.chatId})`);
    }
  }

  if (entryOps.length) await ChatEntryModel.bulkWrite(entryOps);

  return summary;
}
