// src/controllers/semanticSearch.ts
import { Request, Response, NextFunction } from 'express';
import { getPineconeIndex, getIndexDimension } from '../pineconeClient';
import { embedText } from '../services/openaiClient'; // named import from A)
import { SemanticSearchBody } from '../routes/schemas'; // from your Zod step

const NAMESPACE = process.env.PINECONE_NAMESPACE || undefined;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

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

    const results = (response.matches ?? []).map((m) => ({
      id: m.id,
      score: m.score,
      entryId: m.metadata?.entryId,
      chatId: m.metadata?.chatId,
      projectId: m.metadata?.projectId,
      promptSummary: m.metadata?.promptSummary ?? '',
    }));

    res.json({ results });
  } catch (err) {
    next(err);
  }
}
