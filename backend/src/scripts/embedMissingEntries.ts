// scripts/embedMissingEntries.ts

/*
  cd /Users/tedshaffer/Documents/Projects/chatsworthbackend
  npx ts-node -r dotenv/config src/scripts/embedMissingEntries.ts
*/

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { ChatEntryModel } from '../models/ChatEntry';
import { getEmbedding } from '../utilities/embed';

// Connect to MongoDB
async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('Missing MONGO_URI in environment');
  }
  await mongoose.connect(uri);
}

async function main() {
  await connectDB();

  const entries = await ChatEntryModel.find({ embedding: { $exists: false } });

  console.log(`Found ${entries.length} entries to embed.`);

  for (const entry of entries) {
    const text = [entry.originalPrompt, entry.promptSummary, entry.response]
      .filter(Boolean)
      .join('\n');

    try {
      const embedding = await getEmbedding(text);
      entry.embedding = embedding;
      await entry.save();
      console.log(`Embedded entry ${entry.entryId}`);
    } catch (err) {
      console.error(`❌ Failed to embed ${entry.entryId}:`, err);
    }
  }

  console.log('✅ Done.');
  process.exit();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
