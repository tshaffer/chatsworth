// pineconeClient.ts
import { Pinecone } from '@pinecone-database/pinecone';

const apiKey = process.env.PINECONE_API_KEY;

console.log('apiKey:', apiKey);

if (!apiKey) throw new Error('Missing PINECONE_API_KEY');

export const pinecone = new Pinecone({
  apiKey: apiKey,
});
