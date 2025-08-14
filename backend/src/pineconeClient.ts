// src/pineconeClient.ts
import { Pinecone, Index } from '@pinecone-database/pinecone';

export function getPineconeIndex(): Index {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME;
  if (!apiKey) throw new Error('Missing PINECONE_API_KEY');
  if (!indexName) throw new Error('Missing PINECONE_INDEX_NAME');

  const pc = new Pinecone({ apiKey });
  const host = process.env.PINECONE_INDEX_HOST; // optional
  // @ts-ignore second arg supported at runtime for v2
  return host ? pc.index(indexName, host) : pc.index(indexName);
}

export async function getIndexDimension(index: Index): Promise<number> {
  const stats = await index.describeIndexStats();
  // @ts-ignore v2 surfaces dimension in different shapes depending on deployment
  return stats.dimension ?? stats.database?.dimension ?? 1536;
}
