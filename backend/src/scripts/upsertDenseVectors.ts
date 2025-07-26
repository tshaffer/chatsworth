import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
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

    const vector = 0;

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

    // console.log(vectors[0]);
    // console.log(vectors[0].id);
    // console.log(vectors[0].values);
    // console.log(vectors[0].metadata);
    const oneVectors = [vectors[0]]; // For debugging, only upsert the first vector
    // console.log('upsert the first vector:', oneVectors);
    await index.upsert(oneVectors); // Use the oneVectors for debugging
    console.log('upserted the first vector:');
    process.exit(0);
    // await index.upsert(vectors);
    console.log(`✅ Upserted ${Math.min(i + batchSize, entries.length)} / ${entries.length}`);
  }
}

async function main() {

  await (upsertChatEntries());

  process.exit(0);
  // const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

  // const index = pinecone.index("chatsworth-chatentries-2", process.env.PINECONE_INDEX_HOST)
  // const stats: IndexStatsDescription = await (index.describeIndexStats());
  // console.log('dimension:', stats.dimension);

  // index.upsert(records).then(() => {
  //   console.log('Records upserted successfully');
  // }).catch(err => {
  //   console.error('Error upserting records:', err);
  // });
}


connectDB()
  .then(() => {
    console.log('Database connected successfully.');
    main();
  });
