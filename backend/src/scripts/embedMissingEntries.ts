// scripts/embedMissingEntries.ts

/*
  cd /Users/tedshaffer/Documents/Projects/chatsworth/backend
  npx ts-node -r dotenv/config src/scripts/embedMissingEntries.ts
*/

import 'dotenv/config';
import mongoose from 'mongoose';
import { encoding_for_model } from 'tiktoken';
import { ChatEntryModel } from '../models/ChatEntry'; // ← adjust path if needed
import { getEmbeddings, EMBEDDING_MODEL } from '../utilities/embed';

// -----------------------------
// Config
// -----------------------------
const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://127.0.0.1:27017/chatsworthv2';

const BATCH_SIZE = 64;              // how many entries to embed per API call
const TOKEN_LIMIT = 8000;           // keep headroom under 8192
const USE_HEAD_TAIL = true;         // head+tail truncation (better than head-only)
const HEAD_RATIO = 0.5;             // 50/50 split head/tail within TOKEN_LIMIT

// Pick the field to embed, in priority order
function pickTextToEmbed(e: any): string {
  return (e.promptSummary?.trim() ||
          e.response?.trim() ||
          e.originalPrompt?.trim() ||
          '').toString();
}

// -----------------------------
// Tokenizer & truncation helpers
// -----------------------------
const enc = encoding_for_model(EMBEDDING_MODEL);

// Put these near your tokenizer setup
// Node 18+ has global TextDecoder; for types in TS you can import from 'util' if needed:
// import { TextDecoder } from 'util';
const textDecoder = new TextDecoder('utf-8');

function decodeTokens(tokens: Uint32Array): string {
  // enc.decode returns Uint8Array (bytes); convert to string:
  const bytes = enc.decode(tokens);
  return textDecoder.decode(bytes);
}

function concatU32(...parts: Uint32Array[]): Uint32Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint32Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Truncate to ≤ TOKEN_LIMIT tokens; if USE_HEAD_TAIL, keep both ends. */
function truncateToTokenLimit(text: string): string {
  if (!text) return '';
  const toks = enc.encode(text); // Uint32Array

  if (toks.length <= TOKEN_LIMIT) return text;

  if (!USE_HEAD_TAIL) {
    // Head-only
    const head = toks.subarray(0, TOKEN_LIMIT); // still Uint32Array
    return decodeTokens(head);
  }

  // Head+Tail
  const headTokens = Math.floor(TOKEN_LIMIT * HEAD_RATIO);
  const tailTokens = TOKEN_LIMIT - headTokens;

  const head = toks.subarray(0, headTokens);                       // Uint32Array
  const tail = toks.subarray(Math.max(0, toks.length - tailTokens));
  const sep  = enc.encode(' … ');                                  // Uint32Array

  // Concatenate as Uint32Array, then trim if needed
  let combined = concatU32(head, sep, tail);
  if (combined.length > TOKEN_LIMIT) {
    combined = combined.subarray(0, TOKEN_LIMIT);
  }
  return decodeTokens(combined);
}

// -----------------------------
// Main
// -----------------------------
async function main() {
  console.log('[embedMissingEntries] starting…');

  // Connect if not already connected by your app bootstrap
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI, { dbName: undefined as any });
  }

  // Select only what we need
  const cursor = ChatEntryModel.find(
    {
      $or: [
        { embedding: { $exists: false } },
        { embedding: null },
      ],
      // If you have soft-deletes, skip them:
      // $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    },
    // projection:
    { entryId: 1, promptSummary: 1, response: 1, originalPrompt: 1 }
  )
    .lean()
    .cursor();

  let batchDocs: any[] = [];
  let totalProcessed = 0;
  let totalEmbedded = 0;
  let totalSkippedEmpty = 0;
  let totalFailed = 0;

  async function flushBatch() {
    if (batchDocs.length === 0) return;

    // Build inputs
    const inputs: string[] = batchDocs.map(d => truncateToTokenLimit(pickTextToEmbed(d)));

    // Identify empties (skip them so we don't waste quota)
    const nonEmptyIdx: number[] = [];
    const nonEmptyTexts: string[] = [];
    inputs.forEach((txt, idx) => {
      if (txt && txt.trim().length > 0) {
        nonEmptyIdx.push(idx);
        nonEmptyTexts.push(txt);
      }
    });

    // Map from non-empty position back to original doc
    const nonEmptyDocs = nonEmptyIdx.map(i => batchDocs[i]);

    try {
      // ---- Bulk embedding call ----
      const vectors = await getEmbeddings(nonEmptyTexts);

      // ---- Prepare bulk DB updates ----
      const ops = vectors.map((vec, i) => ({
        updateOne: {
          filter: { entryId: nonEmptyDocs[i].entryId },
          update: { $set: { embedding: vec } },
          upsert: false,
        },
      }));

      if (ops.length) {
        await ChatEntryModel.bulkWrite(ops, { ordered: false });
        totalEmbedded += ops.length;
      }

      // Count empties
      totalSkippedEmpty += (batchDocs.length - nonEmptyDocs.length);
    } catch (err: any) {
      totalFailed += batchDocs.length;
      console.error(`❌ Batch failed (${batchDocs.length} docs):`, err?.message || err);
      // If you want to be extra resilient, you can fall back to per-item on error.
      // For simplicity (and because we truncated), we just log and move on.
    } finally {
      totalProcessed += batchDocs.length;
      batchDocs = [];
      process.stdout.write(
        `\rProcessed=${totalProcessed}  Embedded=${totalEmbedded}  Empty=${totalSkippedEmpty}  Failed=${totalFailed}`
      );
    }
  }

  for await (const doc of cursor) {
    batchDocs.push(doc);
    if (batchDocs.length >= BATCH_SIZE) {
      await flushBatch();
    }
  }
  await flushBatch();

  console.log('\n[embedMissingEntries] done.');
  await mongoose.disconnect().catch(() => {});
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
