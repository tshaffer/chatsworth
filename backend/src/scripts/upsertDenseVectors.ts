import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { IndexStatsDescription, Pinecone } from '@pinecone-database/pinecone'
import { ChatEntryModel } from '../models';

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('Missing MONGO_URI');
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  } as any);
  console.log('MongoDB connected.'); // Add this for clarity
}


const records = [
  {
    id: 'A',
    values: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
    metadata: { genre: "comedy", year: 2020 },
  },
  {
    id: 'B',
    values: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
    metadata: { genre: "documentary", year: 2019 },
  },
  {
    id: 'C',
    values: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
    metadata: { genre: "comedy", year: 2019 },
  },
  {
    id: 'D',
    values: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
    metadata: { genre: "drama" },
  }
]

async function upsertChatEntries() {
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const index = pinecone.index(process.env.PINECONE_INDEX_NAME, process.env.PINECONE_INDEX_HOST)
  const stats: IndexStatsDescription = await (index.describeIndexStats());
  console.log('dimension:', stats.dimension);

  const entries = await ChatEntryModel.find();
  console.log(`Uploading ${entries.length} entries to Pinecone...`);

}

async function main() {
  
  await (upsertChatEntries());

  process.exit(0);
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

  const index = pinecone.index("chatsworth-chatentries-2", process.env.PINECONE_INDEX_HOST)
  const stats: IndexStatsDescription = await (index.describeIndexStats());
  console.log('dimension:', stats.dimension);

  index.upsert(records).then(() => {
    console.log('Records upserted successfully');
  }).catch(err => {
    console.error('Error upserting records:', err);
  });
}


connectDB()
  .then(() => {
    console.log('Database connected successfully.');
    main();
  });
