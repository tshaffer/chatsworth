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
  _id: string;
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

    const flat: FlatHit[] = matches
      .map((m) => ({
        // ✅ use Pinecone's record id as the entryId if metadata.entryId is missing
        entryId: String(m.metadata?.entryId ?? m.id ?? ''),
        chatId: String(m.metadata?.chatId ?? ''),
        projectId: String(m.metadata?.projectId ?? ''),
        score: Number(m.score ?? 0),
        // Pinecone metadata can be string|number|boolean -> coerce to string
        promptSummary: String(m.metadata?.promptSummary ?? ''),
      }))
      .filter((h) => h.entryId && h.chatId && h.projectId);

    // If nothing matched, return the grouped shape with an empty array
    if (flat.length === 0) {
      return res.json({ results: [] });
    }

    // 1) Fetch the full entry docs for all matched entryIds
    const entryIds = Array.from(new Set(flat.map((h) => h.entryId)));
    const entries = (await ChatEntryModel.find(
      { _id: { $in: entryIds } },
      { _id: 1, projectId: 1, chatId: 1, originalPrompt: 1, promptSummary: 1, response: 1 }
    ).lean()) as unknown as EntryDoc[];

    const entryById = new Map<string, EntryDoc>(
      entries.map((e: EntryDoc) => [String(e._id), e])
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
      projectNameById.set(String(p.id), String(p.name ?? p.id));
      for (const ch of (p.chats ?? [])) {
        if (ch && ch.id) {
          chatTitleById.set(String(ch.id), String(ch.title ?? ch.id));
        }
      }
    }

    // 3) Group into your exact frontend shape
    type AccChat = {
      chatId: string;
      chatTitle: string;
      entries: {
        _id: string;
        chatId: string;
        projectId: string;
        originalPrompt: string;
        promptSummary: string;
        response: string;
      }[];
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
        _id: String(e._id),
        chatId: e.chatId,
        projectId: e.projectId,
        originalPrompt: e.originalPrompt ?? '',
        promptSummary: (e.promptSummary ?? h.promptSummary ?? ''),
        response: e.response ?? '',
      });
    }

    const results = Array.from(byProject.values()).map((p) => ({
      projectId: p.projectId,
      projectName: p.projectName,
      chats: Array.from(p.chats.values()),
    }));

    return res.json({ results });

  } catch (err) {
    next(err);
  }
}
