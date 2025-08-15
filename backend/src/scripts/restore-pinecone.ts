// scripts/restore-pinecone.ts
import 'dotenv/config';
import fs from 'fs';
import readline from 'readline';
import { Pinecone } from '@pinecone-database/pinecone';

// UNTESTED: This script restores vectors to Pinecone from a JSONL file.
// # Run (namespace optional)
// npx tsx src/scripts/restore-pinecone.ts --in=./backups/pre-upsert.jsonl --batch=100 --namespace=""

// # Or let it use the per-line namespaces stored in the file
// npx tsx src/scripts/restore-pinecone.ts --in=./backups/pre-upsert.jsonl

/**
 * JSONL line shape produced by backup:
 * {
 *   id: string,
 *   values?: number[],
 *   metadata?: Record<string, unknown>,
 *   sparseValues?: { indices: number[]; values: number[] },
 *   namespace?: string
 * }
 */

type CLI = {
  in: string;
  batch?: number;
  namespace?: string; // override namespace for all lines
};

function parseArgs(): CLI {
  const args = process.argv.slice(2);
  const get = (key: string) => {
    const ix = args.findIndex(a => a.startsWith(`--${key}=`));
    return ix >= 0 ? args[ix].split('=')[1] : undefined;
  };
  const input = get('in');
  if (!input) {
    console.error('Usage: tsx scripts/restore-pinecone.ts --in=./backups/file.jsonl [--batch=100] [--namespace=""]');
    process.exit(1);
  }
  const batch = get('batch') ? Number(get('batch')) : 100;
  const namespace = get('namespace'); // optional
  return { in: input, batch, namespace };
}

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

async function withRetry<T>(fn: () => Promise<T>, tries = 5, label = 'op'): Promise<T> {
  let delay = 500;
  for (let t = 0; t < tries; t++) {
    try {
      return await fn();
    } catch (e: any) {
      const code = e?.status || e?.code || '';
      const msg = String(e?.message ?? e);
      const retriable = [429, 500, 502, 503, 504].includes(Number(code)) || /ECONNRESET|ETIMEDOUT/i.test(msg);
      if (!retriable || t === tries - 1) {
        console.error(`❌ ${label} failed (attempt ${t + 1}/${tries}):`, msg);
        throw e;
      }
      const jitter = Math.floor(Math.random() * 250);
      console.warn(`⚠️ ${label} retry ${t + 1}/${tries} after ${delay}ms (code=${code})`);
      await sleep(delay + jitter);
      delay = Math.min(delay * 2, 8000);
    }
  }
  // Unreachable
  throw new Error(`${label} failed after retries`);
}

type JsonlVector = {
  id: string;
  values?: number[];
  metadata?: Record<string, unknown>;
  sparseValues?: { indices: number[]; values: number[] };
  namespace?: string;
};

async function main() {
  const cli = parseArgs();

  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME_DEV;
  const indexHost = process.env.PINECONE_INDEX_HOST_DEV;
  if (!apiKey || !indexName || !indexHost) {
    throw new Error('Missing PINECONE_API_KEY, PINECONE_INDEX_NAME_DEV, or PINECONE_INDEX_HOST_DEV');
  }

  const pinecone = new Pinecone({ apiKey });
  const index = pinecone.index(indexName, indexHost);

  const rl = readline.createInterface({
    input: fs.createReadStream(cli.in, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  const batchSize = Math.max(1, Number.isFinite(cli.batch!) ? cli.batch! : 100);

  // We group by namespace to avoid mixing namespaces in a single upsert call.
  const buffers = new Map<string, Array<any>>();

  let totalRead = 0;
  let totalQueued = 0;
  let totalSkipped = 0;
  let totalUpserted = 0;

  function nsKey(ns?: string) {
    // if user passed --namespace, it overrides any line-level namespace
    return cli.namespace !== undefined ? cli.namespace : (ns ?? '');
  }

  async function flushNamespace(ns: string, force = false) {
    const buf = buffers.get(ns);
    if (!buf || buf.length === 0) return;

    if (buf.length >= batchSize || force) {
      const vectors = buf.splice(0, buf.length); // take all
      await withRetry(
        async () => {
          if (ns) {
            await index.namespace(ns).upsert(vectors);
          } else {
            await index.upsert(vectors);
          }
        },
        5,
        `upsert(ns="${ns}", count=${vectors.length})`
      );
      totalUpserted += vectors.length;
      const pct = totalRead ? Math.round((totalUpserted / totalRead) * 100) : 0;
      console.log(`⬆️  Upserted ${totalUpserted}/${totalQueued} vectors (${pct}%) [ns="${ns}"]`);
    }
  }

  console.log(`Restoring from ${cli.in} with batch=${batchSize}` + (cli.namespace !== undefined ? ` (override namespace="${cli.namespace}")` : ''));

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    totalRead++;
    let rec: JsonlVector;
    try {
      rec = JSON.parse(trimmed);
    } catch (e) {
      console.warn(`Skipping invalid JSON on line ${totalRead}`);
      totalSkipped++;
      continue;
    }

    if (!rec.id || !rec.values || !Array.isArray(rec.values)) {
      // Pinecone upsert requires values; skip metadata-only records.
      totalSkipped++;
      continue;
    }

    const ns = nsKey(rec.namespace);
    const vec = {
      id: String(rec.id),
      values: rec.values,
      metadata: rec.metadata ?? undefined,
      sparseValues: rec.sparseValues ?? undefined,
    };

    if (!buffers.has(ns)) buffers.set(ns, []);
    buffers.get(ns)!.push(vec);
    totalQueued++;

    // Flush if this namespace buffer reached batch size
    if (buffers.get(ns)!.length >= batchSize) {
      await flushNamespace(ns);
    }

    // Periodic progress
    if (totalRead % 2000 === 0) {
      console.log(`Read ${totalRead} lines… queued ${totalQueued}, skipped ${totalSkipped}, upserted ${totalUpserted}`);
    }
  }

  // Flush all remaining
  for (const ns of buffers.keys()) {
    await flushNamespace(ns, true);
  }

  console.log(`✅ Restore complete. Read: ${totalRead}, Queued: ${totalQueued}, Skipped: ${totalSkipped}, Upserted: ${totalUpserted}.`);
}

main().catch((err) => {
  console.error('Restore failed:', err);
  process.exit(1);
});
