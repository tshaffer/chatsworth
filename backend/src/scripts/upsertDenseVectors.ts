// to execute, change to directory
//    /Users/tedshaffer/Documents/Projects/chatsworth/backend
// execute
//    npx ts-node src/scripts/upsertDenseVectors.ts

// src/scripts/upsertDenseVectors.ts
//    npx ts-node -r dotenv/config src/scripts/upsertDenseVectors.ts

import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import fs from 'fs';
import { Pinecone, IndexStatsDescription } from '@pinecone-database/pinecone';
import { ChatEntryModel } from '../models';
import { getEmbedding } from '../utilities';

// ---- Tunables ----
const CHUNK_STRATEGY: 'chunk' | 'truncate' = 'chunk'; // set to 'truncate' if you prefer
const MAX_MODEL_TOKENS = 8192;
const SAFETY_MARGIN_TOKENS = 1600; // headroom for safety
const MAX_TOKENS_PER_CHUNK = Math.max(1024, MAX_MODEL_TOKENS - SAFETY_MARGIN_TOKENS);
// Conservative token estimate
const CHARS_PER_TOKEN = 3;
const MAX_CHARS_PER_CHUNK = MAX_TOKENS_PER_CHUNK * CHARS_PER_TOKEN;
// Pinecone upsert batch size
const UPSERT_BATCH = 100;
// Log file for truncations (only used when truncating)
const TRUNC_LOG = '/Users/tedshaffer/Documents/tmpFiles/chatsworth/pinecone/truncated_entries.log';

// -------------------

function ensureDirFor(filePath: string) {
  const dir = filePath.replace(/\/[^/]+$/, '');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function estimateTokensByChars(s: string): number {
  return Math.ceil(s.length / CHARS_PER_TOKEN);
}

function chunkText(text: string): string[] {
  if (text.length <= MAX_CHARS_PER_CHUNK) return [text];

  // Split by paragraph blocks first
  const parts = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current) {
      chunks.push(current);
      current = '';
    }
  };

  for (const part of parts) {
    const tentative = current ? `${current}\n\n${part}` : part;

    if (tentative.length <= MAX_CHARS_PER_CHUNK) {
      current = tentative;
      continue;
    }

    // If a single paragraph is too large, split by lines
    if (!current) {
      const lines = part.split(/\n/);
      let block = '';
      for (const line of lines) {
        const t2 = block ? `${block}\n${line}` : line;
        if (t2.length <= MAX_CHARS_PER_CHUNK) {
          block = t2;
        } else {
          if (block) chunks.push(block);
          if (line.length > MAX_CHARS_PER_CHUNK) {
            // Pathological long line: hard slice
            for (let i = 0; i < line.length; i += MAX_CHARS_PER_CHUNK) {
              chunks.push(line.slice(i, i + MAX_CHARS_PER_CHUNK));
            }
            block = '';
          } else {
            block = line;
          }
        }
      }
      if (block) chunks.push(block);
    } else {
      // finalize current then re-handle this part fresh
      pushCurrent();
      if (part.length <= MAX_CHARS_PER_CHUNK) {
        current = part;
      } else {
        const sub = chunkText(part);
        for (const s of sub) chunks.push(s);
      }
    }
  }
  pushCurrent();
  return chunks;
}

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('Missing MONGO_URI');
  // Modern Mongoose: no need for useNewUrlParser/useUnifiedTopology flags
  await mongoose.connect(uri as string);
  console.log('MongoDB connected.');
}

// Add this helper
async function upsertCompat(index: any, vectors: any[], namespace: string) {
  // Prefer namespaced upsert if available (newer SDKs)
  if (typeof index.namespace === 'function' && namespace) {
    const ns = index.namespace(namespace);
    if (ns && typeof ns.upsert === 'function') {
      return await ns.upsert(vectors); // vectors-only form under a namespace
    }
  }

  // Try new SDK object form
  if (typeof index.upsert === 'function') {
    try {
      return await (index as any).upsert({ vectors, namespace });
    } catch {
      // fall through to legacy
    }
  }

  // Legacy vectors-only form
  if (typeof index.upsert === 'function') {
    return await (index as any).upsert(vectors);
  }

  throw new Error('No compatible Pinecone upsert method found.');
}

async function upsertChatEntries() {
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const indexName = process.env.PINECONE_INDEX_NAME_DEV!;
  const indexHost = process.env.PINECONE_INDEX_HOST_DEV!;
  const namespace = process.env.PINECONE_NAMESPACE ?? ''; // '' is default ns
  const index = pc.index(indexName, indexHost);

  const stats: IndexStatsDescription = await index.describeIndexStats();
  console.log('dimension:', (stats as any).dimension);

  const entries = await ChatEntryModel.find().lean();
  console.log(`Uploading ${entries.length} entries to Pinecone...`);

  let totalVectors = 0;
  let upsertsSoFar = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry: any = entries[i];
    const entryId = String(entry.entryId ?? entry._id);

    let text = [entry.originalPrompt, entry.promptSummary, entry.response]
      .filter(Boolean)
      .join('\n');

    // Choose texts per strategy
    let texts: string[] = [];
    if (CHUNK_STRATEGY === 'chunk') {
      texts = chunkText(text);
    } else {
      // Truncate
      if (text.length > MAX_CHARS_PER_CHUNK) {
        ensureDirFor(TRUNC_LOG);
        fs.appendFileSync(TRUNC_LOG, `${entryId}\n`);
        console.warn(
          `⚠️ Truncating entry ${entryId} from ${text.length} to ${MAX_CHARS_PER_CHUNK} characters.`
        );
        text = text.slice(0, MAX_CHARS_PER_CHUNK);
      }
      texts = [text];
    }

    // Defensive clamp
    texts = texts.map((t) => (t.length <= MAX_CHARS_PER_CHUNK ? t : t.slice(0, MAX_CHARS_PER_CHUNK)));

    // Stage vectors (embed chunk-by-chunk)
    let staged: Array<{ id: string; values: number[]; metadata?: Record<string, any> }> = [];

    for (let j = 0; j < texts.length; j++) {
      const t = texts[j];

      const estTokens = estimateTokensByChars(t);
      if (estTokens > MAX_TOKENS_PER_CHUNK) {
        console.warn(
          `⚠️ Estimated ${estTokens} tokens (> ${MAX_TOKENS_PER_CHUNK}) for ${entryId}#p${j}. Slicing to ${MAX_CHARS_PER_CHUNK} chars.`
        );
      }

      const values = await getEmbedding(t);

      staged.push({
        id: texts.length === 1 ? entryId : `${entryId}#p${j}`,
        values,
        metadata: {
          entryId,
          projectId: entry.projectId,
          chatId: entry.chatId,
          position: entry.position,
          title: entry.title ?? null,
          chunkIndex: j,
          chunkCount: texts.length,
        },
      });

      // Flush in batches
      if (staged.length >= UPSERT_BATCH) {
        await upsertCompat(index, staged, namespace);
        upsertsSoFar += staged.length;
        totalVectors += staged.length;
        staged = [];
        if ((i + 1) % 50 === 0) {
          console.log(
            `...progress: processed ${i + 1}/${entries.length} entries, upserted vectors in last flush: ${upsertsSoFar}`
          );
          upsertsSoFar = 0;
        }
      }
    }

    // Flush remaining for this entry
    if (staged.length) {
      await upsertCompat(index, staged, namespace);
      totalVectors += staged.length;
    }

    // Occasional progress
    if ((i + 1) % 100 === 0 || i === entries.length - 1) {
      console.log(`✅ Processed ${i + 1} / ${entries.length} entries (total vectors so far: ${totalVectors})`);
    }
  }

  console.log(`🎉 Finished. Total vectors upserted: ${totalVectors}`);
}

async function main() {
  await upsertChatEntries();
  process.exit(0);
}

connectDB()
  .then(() => {
    console.log('Database connected successfully.');
    return main();
  })
  .catch((err) => {
    console.error('❌ Error connecting to DB:', err);
    process.exit(1);
  });
