// import dotenv from 'dotenv';
// dotenv.config();

// import mongoose from 'mongoose';
// import { pinecone } from '../pineconeClient'; // Make sure this file is pristine as described above
// import { ChatEntryModel } from '../models/ChatEntry';
// import { getEmbedding } from '../utilities/embed'; // you'll need to restore this

// async function connectDB() {
//   const uri = process.env.MONGO_URI;
//   if (!uri) throw new Error('Missing MONGO_URI');
//   await mongoose.connect(uri, {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//   } as any);
//   console.log('MongoDB connected.'); // Add this for clarity
// }

// async function upsertChatEntries() {
//   const indexName = process.env.PINECONE_INDEX_NAME; // No '!' needed here, will be checked below
//   const pineconeIndexHost = process.env.PINECONE_INDEX_HOST; // No '!' needed here

//   console.log('Fetching environment variables...');
//   console.log('PINECONE_INDEX_NAME:', indexName); // Debugging line
//   console.log('PINECONE_INDEX_HOST:', pineconeIndexHost); // Debugging line

//   if (!indexName) {
//     console.error('Error: Missing PINECONE_INDEX_NAME in .env');
//     process.exit(1);
//   }
//   if (!pineconeIndexHost) {
//     console.error('Error: Missing PINECONE_INDEX_HOST in .env');
//     process.exit(1);
//   }

//   // Initialize the Pinecone index client using the host URL
//   console.log('Attempting to initialize Pinecone index with host:', pineconeIndexHost); // Debugging line
//   const index = pinecone.Index(pineconeIndexHost); // This is the crucial change
//   console.log('Pinecone index client initialized successfully.'); // Debugging line

//   const entries = await ChatEntryModel.find();
//   console.log(`Uploading ${entries.length} entries to Pinecone...`);

//   const batchSize = 100;
//   for (let i = 0; i < entries.length; i += batchSize) {
//     const batch = entries.slice(i, i + batchSize);

//     const vector = 0;

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

//     // console.log(vectors[0]);
//     // console.log(vectors[0].id);
//     // console.log(vectors[0].values);
//     // console.log(vectors[0].metadata);
//     const oneVectors = [vectors[0]]; // For debugging, only upsert the first vector
//     console.log('upsert the first vector:', oneVectors);
//     await index.upsert(oneVectors); // Use the oneVectors for debugging
//     console.log('upserted the first vector:');
//     process.exit(0);
//     // await index.upsert(vectors);
//     console.log(`✅ Upserted ${Math.min(i + batchSize, entries.length)} / ${entries.length}`);
//   }

//   console.log('🎉 All entries upserted.');
//   process.exit(0);
// }

// connectDB()
//   .then(upsertChatEntries)
//   .catch((err) => {
//     console.error('❌ Error during upsert:', err);
//     process.exit(1);
//   });
