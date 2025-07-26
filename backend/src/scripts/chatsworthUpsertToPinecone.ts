import dotenv from 'dotenv';
dotenv.config();

import { Pinecone } from '@pinecone-database/pinecone';

import mongoose from 'mongoose';
import { ChatEntryModel } from '../models/ChatEntry';

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
  console.log('Fetching chatEntries...');
  const entries = await ChatEntryModel.find();
  console.log(`Uploading ${entries.length} entries to Pinecone...`);
}

async function runUpsertChatsworthToPinecone() {
  try {

    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      console.error('Error: PINECONE_API_KEY is not set in .env');
      process.exit(1);
    }
    console.log('apiKey:', apiKey);

    const pinecone = new Pinecone({
      apiKey: apiKey,
    });
    console.log('Main Pinecone client initialized.');

    const indexName = 'chatsworth-chatentries';
    const index = pinecone.index(indexName).namespace("example-namespace");
    console.log('index', index);

    //     // Upsert the records into a namespace
    //     await index.upsertRecords(newRecords);
    const testVector = {
      id: `test-vector-${Date.now()}`,
      values: Array.from({ length: 1024 }, () => Math.random() * 2 - 1),
      metadata: {
        source: 'minimal-test-script',
        timestamp: new Date().toISOString(),
      },
    };

    await index.upsertRecords([testVector]);

  } catch (error) {
    console.error('❌ Error during minimal upsert test:', error);
  } finally {
    console.log('--- Test Finished ---');
    process.exit(0);
  }
};

connectDB()
  .then(async () => {
    // upsertChatEntries();
    // console.log('Chat entries upserted successfully.');
    await runUpsertChatsworthToPinecone();
    console.log('Test completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error during upsert:', err);
    process.exit(1);
  });

// const newRecords = [
//   { "_id": "rec51", "chunk_text": "Pizza is my favorite food.", "category": "food" },
//   { "_id": "rec52", "chunk_text": "Burritos are my second favorite food.", "category": "food" }
// ];

// // Target the index
// const index = pc.index(indexName).namespace("example-namespace");

// async function main() {
//   console.log('PINECONE_INDEX_NAME:', indexName); // Debugging line
//   try {

//     // Upsert the records into a namespace
//     await index.upsertRecords(newRecords);

//     // Wait for the upserted vectors to be indexed
//     await new Promise(resolve => setTimeout(resolve, 10000));

//     // View stats for the index
//     const stats = await index.describeIndexStats();
//     console.log(stats);

//   } catch (error) {
//     console.error('Error upserting records:', error);
//   }
// }

// main();
