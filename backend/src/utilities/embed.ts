// src/utilities/embed.ts
import 'dotenv/config';
import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('Missing OPENAI_API_KEY. Put it in backend/.env or export it.');
}

export const openai = new OpenAI({ apiKey });

// 1536 dims -> matches your schema validator
export const EMBEDDING_MODEL = 'text-embedding-3-small';

export async function getEmbedding(text: string): Promise<number[]> {
  const [vec] = await getEmbeddings([text]);
  return vec;
}

/** Bulk retrieval: pass an array of texts, get an array of vectors in the same order. */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  // API preserves order 1:1 with input
  return res.data.map(d => d.embedding);
}
