// to execute, change to directory
//    /Users/tedshaffer/Documents/Projects/chatsworth/backend
// execute
//    npx ts-node src/scripts/upsertDenseVectors.ts

// src/scripts/upsertDenseVectors.ts
//    npx ts-node -r dotenv/config src/scripts/upsertDenseVectors.ts

import dotenv from 'dotenv';
dotenv.config();

// src/scripts/upsertDenseVectors.ts
//    npx ts-node -r dotenv/config src/scripts/upsertDenseVectors.ts

import mongoose from 'mongoose';
import fs from 'fs';
import { Pinecone, IndexStatsDescription } from '@pinecone-database/pinecone';
import { ChatEntryModel } from '../models';
import { getEmbedding } from '../utilities';
import { encoding_for_model } from 'tiktoken';

// ---- Tunables ----
const CHUNK_STRATEGY: 'chunk' | 'truncate' = 'chunk'; // 'chunk' strongly recommended
const MODEL_NAME = 'text-embedding-3-small';          // keep in sync with getEmbedding()
const MAX_MODEL_TOKENS = 8192;
const TOKEN_BUDGET = 8000;                            // hard cap per call (safely < 8192)
// Pinecone upsert batch size
const UPSERT_BATCH = 100;
// Log file for truncations (only used when truncating)
const TRUNC_LOG = '/Users/tedshaffer/Documents/tmpFiles/chatsworth/pinecone/truncated_entries.log';

// -------------------

const enc = encoding_for_model(MODEL_NAME);
const textDecoder = new TextDecoder('utf-8');

function decodeTokens(tokens: Uint32Array): string {
  const bytes = enc.decode(tokens);
  return textDecoder.decode(bytes);
}

function ensureDirFor(filePath: string) {
  const dir = filePath.replace(/\/[^/]+$/, '');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Add near the top with your helpers
function buildMetadata(entry: any, chunkIndex: number, chunkCount: number) {
  const md: Record<string, string | number | boolean | string[]> = {
    entryId: String(entry.entryId ?? entry._id),
    projectId: entry.projectId ? String(entry.projectId) : undefined as unknown as never,
    chatId: entry.chatId ? String(entry.chatId) : undefined as unknown as never,
    position: typeof entry.position === 'number' ? entry.position : Number(entry.position ?? 0),
    chunkIndex,
    chunkCount,
  };

  // Only include title if it's a non-empty string
  if (entry.title && String(entry.title).trim().length > 0) {
    md.title = String(entry.title);
  }

  // Drop any undefined/null fields (Pinecone disallows them)
  for (const k of Object.keys(md)) {
    const v = md[k as keyof typeof md];
    if (v === undefined || v === null) delete md[k];
  }
  return md;
}

// Token-aware slice to <= TOKEN_BUDGET
function sliceToTokenBudget(text: string, budget = TOKEN_BUDGET): string {
  const toks = enc.encode(text); // Uint32Array
  if (toks.length <= budget) return text;
  const trimmed = toks.subarray(0, budget);
  return decodeTokens(trimmed);
}

// Build chunks that are each <= TOKEN_BUDGET (favoring paragraph/line boundaries)
function chunkTextTokenAware(text: string, budget = TOKEN_BUDGET): string[] {
  // Quick pass: if already under budget, return as single chunk
  if (enc.encode(text).length <= budget) return [text];

  const chunks: string[] = [];
  const paras = text.split(/\n{2,}/); // paragraph-ish blocks

  let current = '';
  let currentTokens = enc.encode(''); // empty Uint32Array

  const appendWithCheck = (segment: string) => {
    const segTokens = enc.encode(current ? `\n\n${segment}` : segment);
    if (currentTokens.length + segTokens.length <= budget) {
      // safe to append
      current += (current ? `\n\n${segment}` : segment);
      // concat token arrays
      const combined = new Uint32Array(currentTokens.length + segTokens.length);
      combined.set(currentTokens, 0);
      combined.set(segTokens, currentTokens.length);
      currentTokens = combined;
      return true;
    }
    return false;
  };

  const flushCurrent = () => {
    if (!current) return;
    chunks.push(current);
    current = '';
    currentTokens = enc.encode('');
  };

  for (const para of paras) {
    if (appendWithCheck(para)) continue;

    // If a whole paragraph doesn't fit, try line-by-line
    const lines = para.split(/\n/);
    let builtPara = '';
    let builtParaTokens = enc.encode('');

    const appendLine = (line: string) => {
      const piece = builtPara ? `\n${line}` : line;
      const pieceTokens = enc.encode(piece);
      if (currentTokens.length + builtParaTokens.length + pieceTokens.length <= budget) {
        // add to builtPara
        builtPara += piece;
        const newBuilt = new Uint32Array(builtParaTokens.length + pieceTokens.length);
        newBuilt.set(builtParaTokens, 0);
        newBuilt.set(pieceTokens, builtParaTokens.length);
        builtParaTokens = newBuilt;
        return true;
      }
      return false;
    };

    for (const line of lines) {
      if (appendLine(line)) continue;

      // If even a single line doesn't fit, flush what we have first
      if (builtPara) {
        appendWithCheck(builtPara) || (() => { flushCurrent(); appendWithCheck(builtPara); })();
        builtPara = '';
        builtParaTokens = enc.encode('');
      }

      // Now the single line still may be too big—slice by tokens
      const lineTokens = enc.encode(line);
      if (lineTokens.length > budget) {
        // Hard-slice the line into multiple token chunks
        for (let offset = 0; offset < lineTokens.length;) {
          const next = lineTokens.subarray(offset, Math.min(offset + budget, lineTokens.length));
          const piece = decodeTokens(next);
          if (!appendWithCheck(piece)) {
            flushCurrent();
            // Should fit now since piece <= budget
            appendWithCheck(piece);
          }
          offset += next.length;
        }
      } else {
        // line fits alone; either add it now (with newline) or flush + add
        if (!appendWithCheck(line)) {
          flushCurrent();
          appendWithCheck(line);
        }
      }
    }

    if (builtPara) {
      if (!appendWithCheck(builtPara)) {
        flushCurrent();
        appendWithCheck(builtPara);
      }
      builtPara = '';
      builtParaTokens = enc.encode('');
    }
  }

  flushCurrent();

  // Safety: in pathological cases, ensure every chunk ≤ budget
  return chunks.map((c) => sliceToTokenBudget(c, budget));
}

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('Missing MONGO_URI');
  // Modern Mongoose connect (deprecation warnings come from your URI/options; consider switching to mongodb+srv)
  await mongoose.connect(uri as string);
  console.log('MongoDB connected.');
}

// Pinecone upsert compatibility wrapper (handles both SDK eras)
async function upsertCompat(index: any, vectors: any[], namespace: string) {
  if (typeof index.namespace === 'function' && namespace) {
    const ns = index.namespace(namespace);
    if (ns && typeof ns.upsert === 'function') {
      return await ns.upsert(vectors); // vectors[] under a namespace (new SDK)
    }
  }
  if (typeof index.upsert === 'function') {
    try {
      return await (index as any).upsert({ vectors, namespace }); // new SDK object form
    } catch {
      // fall through
    }
    return await (index as any).upsert(vectors); // legacy vectors-only form
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

    let combined = [entry.originalPrompt, entry.promptSummary, entry.response]
      .filter(Boolean)
      .join('\n');

    let chunks: string[];
    if (CHUNK_STRATEGY === 'chunk') {
      chunks = chunkTextTokenAware(combined, TOKEN_BUDGET);
    } else {
      // Hard truncate to budget if not chunking
      const before = enc.encode(combined).length;
      if (before > TOKEN_BUDGET) {
        const afterText = sliceToTokenBudget(combined, TOKEN_BUDGET);
        const after = enc.encode(afterText).length;
        // optional log for visibility
        ensureDirFor(TRUNC_LOG);
        fs.appendFileSync(TRUNC_LOG, `${entryId}\n`);
        console.warn(`⚠️ Truncating ${entryId} from ${before} → ${after} tokens.`);
        combined = afterText;
      }
      chunks = [combined];
    }

    // Stage vectors (embed each chunk)
    let staged: Array<{ id: string; values: number[]; metadata?: Record<string, any> }> = [];

    for (let j = 0; j < chunks.length; j++) {
      const t = chunks[j];

      // Compute embedding
      const values = await getEmbedding(t);

      staged.push({
        id: chunks.length === 1 ? entryId : `${entryId}#p${j}`,
        values,
        metadata: buildMetadata(entry, j, chunks.length),
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

    if (staged.length) {
      await upsertCompat(index, staged, namespace);
      totalVectors += staged.length;
    }

    if ((i + 1) % 100 === 0 || i === entries.length - 1) {
      console.log(`✅ Processed ${i + 1} / ${entries.length} entries (total vectors so far: ${totalVectors})`);
    }
  }

  console.log(`🎉 Finished. Total vectors upserted: ${totalVectors}`);
}

async function main() {
  await upsertChatEntries();
}

connectDB()
  .then(() => {
    console.log('Database connected successfully.');
    return main();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
