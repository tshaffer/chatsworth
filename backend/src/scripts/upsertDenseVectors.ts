// to execute, change to directory
//    /Users/tedshaffer/Documents/Projects/chatsworth/backend
// execute
//    npx ts-node src/scripts/upsertDenseVectors.ts

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import fs from 'fs';
import { IndexStatsDescription, Pinecone } from '@pinecone-database/pinecone'
import { ChatEntryModel } from '../models';
import { getEmbedding } from '../utilities';

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('Missing MONGO_URI');
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  } as any);
  console.log('MongoDB connected.'); // Add this for clarity
}

async function upsertChatEntries() {
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const index = pinecone.index(process.env.PINECONE_INDEX_NAME_DEV, process.env.PINECONE_INDEX_HOST_DEV)
  const stats: IndexStatsDescription = await (index.describeIndexStats());
  console.log('dimension:', stats.dimension);

  const entries = await ChatEntryModel.find();
  console.log(`Uploading ${entries.length} entries to Pinecone...`);

  const batchSize = 100;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const vectors = await Promise.all(
      batch.map(async (entry: any) => {
        const MAX_TOKENS = 8192;
        const MAX_CHARS = MAX_TOKENS * 4; // approx conversion

        let text = [entry.originalPrompt, entry.promptSummary, entry.response]
          .filter(Boolean)
          .join('\n');

        if (text.length > MAX_CHARS) {
          // Optionally log to a file for later review
          fs.appendFileSync('/Users/tedshaffer/Documents/tmpFiles/chatsworth/pinecone/truncated_entries.log', `${entry.entryId}\n`);
        }

        // Truncate to max length
        if (text.length > MAX_CHARS) {
          console.warn(`⚠️ Truncating entry ${entry.entryId.toString()} from ${text.length} to ${MAX_CHARS} characters.`);
          text = text.slice(0, MAX_CHARS);
        }

        const values = await getEmbedding(text);

        return {
          id: entry.entryId.toString(),
          values,
          metadata: {
            entryId: entry.entryId ?? String(entry._id),
            projectId: entry.projectId,
            chatId: entry.chatId,
            position: entry.position,
            title: entry.title ?? null,
            // optionally small, non-PII fields useful for debug/search
          }
        };
      })
    );

    await index.upsert(vectors);
    console.log(`✅ Upserted ${Math.min(i + batchSize, entries.length)} / ${entries.length}`);
  }
}

async function main() {
  await (upsertChatEntries());
  process.exit(0);
}


connectDB()
  .then(() => {
    console.log('Database connected successfully.');
    main();
  });
