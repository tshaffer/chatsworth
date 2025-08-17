// scripts/clearPineconeIndex.ts
import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';

async function clearIndex() {
  const indexName = process.env.PINECONE_INDEX_NAME_DEV!;
  const apiKey = process.env.PINECONE_API_KEY!;
  const host = process.env.PINECONE_INDEX_HOST_DEV!;

  const pinecone = new Pinecone({ apiKey });
  const index = pinecone.index(indexName, host);

  console.log(`Clearing all vectors from index "${indexName}" in default namespace...`);

  // Use cast to avoid TS error
  await (index as any).delete({ deleteAll: true });

  console.log('✅ Done. All vectors removed.');
}

clearIndex().catch((err) => {
  console.error('❌ Error clearing Pinecone index:', err);
  process.exit(1);
});
