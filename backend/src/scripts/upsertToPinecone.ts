import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { pinecone } from '../pineconeClient';
import { ChatEntryModel } from '../models/ChatEntry';
import { getEmbedding } from '../utilities/embed'; // you'll need to restore this

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('Missing MONGO_URI');
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  } as any);
}

async function upsertChatEntries() {
  const indexName = process.env.PINECONE_INDEX_NAME!;
  const pineconeIndexHost = process.env.PINECONE_INDEX_HOST!;
  if (!indexName) throw new Error('Missing PINECONE_INDEX_NAME');
  if (!pineconeIndexHost) throw new Error('Missing PINECONE_INDEX_HOST');

  console.log('pineconeIndexHost:', pineconeIndexHost);
  // Initialize the Pinecone index client using the host URL
  const index = pinecone.Index(pineconeIndexHost); // This is the crucial change
  console.log('index:', index);

  const entries = await ChatEntryModel.find();
  console.log(`Uploading ${entries.length} entries to Pinecone...`);

  const batchSize = 100;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);

    const vectors = await Promise.all(
      batch.map(async (entry: any) => {
        const text = [entry.originalPrompt, entry.promptSummary, entry.response]
          .filter(Boolean)
          .join('\n');

        const values = await getEmbedding(text);
        return {
          id: entry._id.toString(),
          values,
          metadata: {
            chatId: entry.chatId,
            projectId: entry.projectId,
          },
        };
      })
    );

    // await index.upsert(vectors);
    console.log(`✅ Upserted ${Math.min(i + batchSize, entries.length)} / ${entries.length}`);
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
