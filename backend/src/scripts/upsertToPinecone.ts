import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { pinecone } from '../pineconeClient';
import { ChatEntryModel } from '../models/ChatEntry';

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('Missing MONGO_URI');
  await mongoose.connect(uri);
}

async function upsertChatEntries() {
  const index = pinecone.index(
    process.env.PINECONE_INDEX_NAME!,
    process.env.PINECONE_ENVIRONMENT!
  );

  const entries = await ChatEntryModel.find();
  console.log(`🔄 Uploading ${entries.length} entries to Pinecone...`);

  const vectors = entries.map((entry: any) => ({
    id: entry._id.toString(),
    metadata: {
      chatId: entry.chatId,
      projectId: entry.projectId,
    },
    text: [entry.originalPrompt, entry.promptSummary, entry.response]
      .filter(Boolean)
      .join('\n'),
  }));

  const batchSize = 100;
  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);
    await index.upsert(batch);
    console.log(`✅ Upserted ${Math.min(i + batchSize, vectors.length)} / ${vectors.length}`);
  }

  console.log('🎉 All entries upserted.');
  process.exit(0);
}

connectDB()
  .then(upsertChatEntries)
  .catch((err) => {
    console.error('❌ Error during upsert:', err);
    process.exit(1);
  });
