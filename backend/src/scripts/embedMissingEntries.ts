// scripts/embedMissingEntries.ts
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { ChatEntryModel } from '../models/ChatEntry';
import { getEmbedding } from '../utilities/embed';
import { entryFingerprint } from './fingerprint'; // <-- shared helper

// If you ever change models, update this (and your schema + Pinecone index)
const EMBEDDING_DIM = 1536;

// Connect to MongoDB
async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('Missing MONGO_URI in environment');
  }
  await mongoose.connect(uri);
}

function buildText(entry: any) {
  // Include title too; trim and drop empties
  return [
    entry.title,
    entry.originalPrompt,
    entry.promptSummary,
    entry.response,
  ]
    .map((s: unknown) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .join('\n\n');
}

async function main() {
  await connectDB();

  // Re-embed candidates if:
  //  - embedding missing OR null OR empty array
  //  - OR embeddingFingerprint missing
  //  - OR embeddingFingerprint != fingerprint  (field-to-field compare via $expr)
  //
  // NOTE: $expr is supported on modern Mongo. If your server is very old,
  // you can fetch without the $expr arm and do that comparison in JS instead.
  const candidates = await ChatEntryModel.find({
    $or: [
      { embedding: { $exists: false } },
      { embedding: null },
      { embedding: { $size: 0 } },
      { embeddingFingerprint: { $exists: false } },
      { $expr: { $ne: ['$embeddingFingerprint', '$fingerprint'] } },
    ],
  });

  console.log(`Found ${candidates.length} entries to (re)embed.`);

  let done = 0;
  for (const entry of candidates) {
    // Build current text to embed
    const text = buildText(entry);
    if (!text) {
      console.log(
        `⏭️  Skipping entry ${entry.entryId ?? entry._id}: no text to embed`
      );
      continue;
    }

    // Compute current content fingerprint (must match your import/sync formula)
    const currentFp = entryFingerprint({
      title: entry.title,
      promptSummary: entry.promptSummary,
      response: entry.response,
      position: entry.position,
      chatId: entry.chatId,
      projectId: entry.projectId,
    });

    try {
      const embedding = await getEmbedding(text);

      if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIM) {
        throw new Error(
          `Bad embedding length: got ${Array.isArray(embedding) ? embedding.length : typeof embedding
          }, expected ${EMBEDDING_DIM}`
        );
      }

      // Persist embedding + stamp the fingerprint we embedded against.
      // Also backfill "fingerprint" if import/sync missed it for this doc.
      entry.embedding = embedding;
      entry.embeddingFingerprint = currentFp;
      if (!entry.fingerprint) {
        entry.fingerprint = currentFp;
      }
      // Optional: track freshness
      entry.embeddingUpdatedAt = new Date();

      await entry.save();
      done += 1;
      console.log(
        `✅ Embedded entry ${entry.entryId ?? entry._id} (${done}/${candidates.length})`
      );
    } catch (err) {
      console.error(
        `❌ Failed to embed ${entry.entryId ?? entry._id}:`,
        (err as Error)?.message ?? err
      );
    }
  }

  console.log(`✅ Done. Updated ${done} entr${done === 1 ? 'y' : 'ies'}.`);
  process.exit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
