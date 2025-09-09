// src/controllers/semanticSearch.ts
import { Request, Response, NextFunction } from 'express';
import { getPineconeIndex, getIndexDimension } from '../pineconeClient';
import { embedText } from '../services/openaiClient'; // named import from A)
import { SemanticSearchBody } from '../routes/schemas'; // from your Zod step
import { ChatEntryModel } from '../models/ChatEntry';
import { ProjectModel } from '../models/Project';

const NAMESPACE = process.env.PINECONE_NAMESPACE || undefined;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

type EntryDoc = {
  entryId: string;
  projectId: string;
  chatId: string;
  originalPrompt: string;
  promptSummary: string;
  response: string;
};

export async function semanticSearch(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { query, topK } = (req as any).validated.body as SemanticSearchBody;

    // New optional controls (non-breaking defaults)
    const {
      perChatLimit = 5,     // max entries returned per chat
      minScore = 0,         // drop hits below this score
      dedupe = true         // collapse duplicate entryIds keeping best score
    } = ((req as any).validated?.body ?? req.body ?? {}) as {
      perChatLimit?: number;
      minScore?: number;
      dedupe?: boolean;
    };

    const index = getPineconeIndex();
    const expectedDim = await getIndexDimension(index);

    const vec = await embedText(query, EMBEDDING_MODEL);
    if (!Array.isArray(vec) || vec.length !== expectedDim) {
      throw Object.assign(
        new Error(`Embedding dimension mismatch for query: got ${vec?.length}, expected ${expectedDim}`),
        { statusCode: 500 }
      );
    }

    // Scope namespace for queries (don’t pass `namespace` inside query options)
    const scoped = NAMESPACE ? index.namespace(NAMESPACE) : index;

    const response = await scoped.query({
      vector: vec,
      topK,
      includeMetadata: true,
    });

    // Build a flat list of hits from Pinecone (keeping score & ids)
    const matches = (response.matches ?? []).filter(Boolean);

    type FlatHit = {
      entryId: string;
      chatId: string;
      projectId: string;
      score: number;
      promptSummary?: string;
    };

    const mapped: FlatHit[] = matches
      .map((m) => ({
        // Use Pinecone record id as fallback when metadata.entryId is missing
        entryId: String(m.metadata?.entryId ?? m.id ?? ''),
        chatId: String(m.metadata?.chatId ?? ''),
        projectId: String(m.metadata?.projectId ?? ''),
        score: Number(m.score ?? 0),
        promptSummary: String(m.metadata?.promptSummary ?? ''),
      }))
      // require essential ids + drop weak matches
      .filter((h) => h.entryId && h.chatId && h.projectId && h.score >= minScore);

    // Dedupe by entryId, keeping the highest score
    const flat: FlatHit[] = (() => {
      if (!dedupe) return mapped;
      const byEntry = new Map<string, FlatHit>();
      for (const h of mapped) {
        const prev = byEntry.get(h.entryId);
        if (!prev || h.score > prev.score) byEntry.set(h.entryId, h);
      }
      return Array.from(byEntry.values());
    })();

    // If nothing matched, return the grouped shape with an empty array
    if (flat.length === 0) {
      return res.json({ results: [] });
    }

    // 1) Fetch the full entry docs for all matched entryIds
    const entryIds = Array.from(new Set(flat.map((h) => h.entryId)));
    const entries = (await ChatEntryModel.find(
      { entryId: { $in: entryIds } },
      { entryId: 1, projectId: 1, chatId: 1, originalPrompt: 1, promptSummary: 1, response: 1 }
    ).lean()) as unknown as EntryDoc[];

    const entryById = new Map<string, EntryDoc>(
      entries.map((e: EntryDoc) => [String(e.entryId), e])
    );

    // 2) Collect projectIds/chatIds to resolve names/titles
    const projectIds = Array.from(new Set(flat.map((h) => h.projectId)));
    const projects = await ProjectModel.find(
      { id: { $in: projectIds } },
      { id: 1, name: 1, chats: 1 }
    ).lean();

    const projectNameById = new Map<string, string>();
    const chatTitleById = new Map<string, string>();

    for (const p of projects) {
      projectNameById.set(String(p.projectId), String(p.name ?? p.projectId));
      for (const ch of (p.chats ?? [])) {
        if (ch && ch.chatId) {
          chatTitleById.set(String(ch.chatId), String(ch.title ?? ch.chatId));
        }
      }
    }

    type TempEntry = {
      entryId: string;
      chatId: string;
      projectId: string;
      originalPrompt: string;
      promptSummary: string;
      response: string;
      __score: number; // temp field, not returned to client
    };
    type AccChat = {
      chatId: string;
      chatTitle: string;
      entries: TempEntry[];   // was: entries: { ... }[]
    };

    type AccProject = {
      projectId: string;
      projectName: string;
      chats: Map<string, AccChat>;
    };

    const byProject = new Map<string, AccProject>();

    for (const h of flat) {
      const e = entryById.get(h.entryId);
      if (!e) continue;

      let proj = byProject.get(h.projectId);
      if (!proj) {
        proj = {
          projectId: h.projectId,
          projectName: projectNameById.get(h.projectId) ?? h.projectId,
          chats: new Map(),
        };
        byProject.set(h.projectId, proj);
      }

      let chat = proj.chats.get(h.chatId);
      if (!chat) {
        chat = {
          chatId: h.chatId,
          chatTitle: chatTitleById.get(h.chatId) ?? h.chatId,
          entries: [],
        };
        proj.chats.set(h.chatId, chat);
      }

      chat.entries.push({
        entryId: String(e.entryId),
        chatId: e.chatId,
        projectId: e.projectId,
        originalPrompt: e.originalPrompt ?? '',
        promptSummary: e.promptSummary ?? h.promptSummary ?? '',
        response: e.response ?? '',
        __score: h.score,
      });
    }

    const results = Array.from(byProject.values()).map((p) => {
      // sort chats by their top entry score desc
      const chats = Array.from(p.chats.values()).map((ch) => {
        // sort entries by score desc
        ch.entries.sort((a, b) => b.__score - a.__score);
        // limit entries per chat
        if (perChatLimit > 0 && ch.entries.length > perChatLimit) {
          ch.entries = ch.entries.slice(0, perChatLimit);
        }
        return ch;
      });

      chats.sort((a, b) => {
        const topA = a.entries[0]?.__score ?? 0;
        const topB = b.entries[0]?.__score ?? 0;
        return topB - topA;
      });

      // strip temp score before returning
      const cleanedChats = chats.map((ch) => ({
        chatId: ch.chatId,
        chatTitle: ch.chatTitle,
        entries: ch.entries.map(({ __score, ...rest }) => rest),
      }));

      return {
        projectId: p.projectId,
        projectName: p.projectName,
        chats: cleanedChats,
      };
    });

    return res.json({ results });

  } catch (err) {
    next(err);
  }
}
