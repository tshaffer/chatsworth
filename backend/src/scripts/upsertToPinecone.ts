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

// async function xupsertChatEntries() {
//   const index = pinecone.index(
//     process.env.PINECONE_INDEX_NAME!,
//     process.env.PINECONE_ENVIRONMENT!
//   );

//   const entries = await ChatEntryModel.find();
//   console.log(`Uploading ${entries.length} entries to Pinecone...`);

//   const batchSize = 100;
//   for (let i = 0; i < entries.length; i += batchSize) {
//     const batch = entries.slice(i, i + batchSize);

//     const vectors = await Promise.all(
//       batch.map(async (entry: any) => {
//         const text = [entry.originalPrompt, entry.promptSummary, entry.response]
//           .filter(Boolean)
//           .join('\n');

//         const values = await getEmbedding(text);

//         return {
//           id: entry._id.toString(),
//           values,
//           metadata: {
//             chatId: entry.chatId,
//             projectId: entry.projectId,
//           },
//         };
//       })
//     );

//     await index.upsert(vectors);
//     console.log(`✅ Upserted ${Math.min(i + batchSize, entries.length)} / ${entries.length}`);
//   }

//   console.log('🎉 All entries upserted.');
//   process.exit(0);
// }
async function upsertChatEntries() {
  // Get the Pinecone index host from your environment variables or fetch it
  const pineconeIndexHost = process.env.PINECONE_INDEX_HOST!; // Make sure to set this in your .env
  if (!pineconeIndexHost) throw new Error('Missing PINECONE_INDEX_HOST');

  // Initialize the Pinecone index client with the host
  const index = pinecone.index(pineconeIndexHost);

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

    await index.upsert(vectors);
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
