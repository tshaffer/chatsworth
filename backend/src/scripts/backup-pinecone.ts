// scripts/backup-pinecone.ts
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import mongoose from 'mongoose';
import { Pinecone } from '@pinecone-database/pinecone';
import { once } from 'events';

/**
 * HOW TO USE
 * ---------
 * Option A (Mongo): pulls vector IDs from your MongoDB collection and field.
 *    npx ts-node src/scripts/backup-pinecone.ts --from=mongo --mongoCollection=chatentries --idField=_id
 ***** change _id to entryId
 
 * Option B (File): reads vector IDs (one per line) from a text file.
 *    ids.txt contains one ID per line
 *    npx ts-node src/scripts/backup-pinecone.ts --from=file --ids=./ids.txt
 *
 * Common optional flags:
 *   --namespace=my-namespace    (defaults to "")
 *   --out=./backups/backup.jsonl
 *   --batch=1000                (Pinecone fetch max is 1000)
 *
 * Env vars required:
 *   PINECONE_API_KEY
 *   PINECONE_INDEX_NAME_DEV
 *   PINECONE_INDEX_HOST_DEV
 *   (Mongo only) MONGO_URI
 */


type CLI = {
  from: 'mongo' | 'file';
  ids?: string;
  mongoCollection?: string;
  idField?: string;
  namespace?: string;
  out?: string;
  batch?: number;
};

function parseArgs(): CLI {
  const args = process.argv.slice(2);
  const get = (key: string) => {
    const ix = args.findIndex(a => a.startsWith(`--${key}=`));
    if (ix >= 0) return args[ix].split('=')[1];
    const present = args.includes(`--${key}`);
    return present ? '' : undefined;
  };

  const from = (get('from') as CLI['from']) ?? 'mongo';
  const cli: CLI = {
    from,
    ids: get('ids'),
    mongoCollection: get('mongoCollection') ?? 'chatentries',
    idField: get('idField') ?? '_id',
    namespace: get('namespace') ?? '',
    out: get('out') ?? path.join('backups', `pinecone-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`),
    batch: Number(get('batch') ?? 1000),
  };
  return cli;
}

async function ensureDirFor(filePath: string) {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
}

async function readIdsFromFile(filePath: string): Promise<string[]> {
  const ids: string[] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) ids.push(trimmed);
  }
  return ids;
}

async function readIdsFromMongo(collection: string, idField: string): Promise<string[]> {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGO_URI for --from=mongo');

  await mongoose.connect(mongoUri as string);
  const db = mongoose.connection.db!;
  // Project just the ID field; coerce to string
  const cursor = db.collection(collection).find({}, { projection: { [idField]: 1 } });

  const ids: string[] = [];
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc) break;
    const raw = doc[idField];
    if (raw == null) continue;
    ids.push(String(raw));
  }
  await mongoose.disconnect();
  return ids;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function writeJsonl(s: fs.WriteStream, obj: unknown) {
  const ok = s.write(JSON.stringify(obj) + '\n');
  if (!ok) {
    return once(s, 'drain');
  }
  return Promise.resolve();
}

async function main() {
  const cli = parseArgs();

  dotenv.config();
  
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME_DEV;
  const indexHost = process.env.PINECONE_INDEX_HOST_DEV;

  if (!apiKey || !indexName || !indexHost) {
    throw new Error('Missing PINECONE_API_KEY, PINECONE_INDEX_NAME_DEV, or PINECONE_INDEX_HOST_DEV');
  }

  let ids: string[] = [];
  if (cli.from === 'file') {
    if (!cli.ids) throw new Error('Provide --ids=path/to/ids.txt for --from=file');
    ids = await readIdsFromFile(cli.ids);
  } else {
    ids = await readIdsFromMongo(cli.mongoCollection!, cli.idField!);
  }

  if (ids.length === 0) {
    console.warn('No IDs found — nothing to back up.');
    return;
  }

  await ensureDirFor(cli.out!);
  const outStream = fs.createWriteStream(cli.out!, { flags: 'w', encoding: 'utf8' });

  const pinecone = new Pinecone({ apiKey });
  const index = pinecone.index(indexName, indexHost);

  const maxFetch = 200;
  const batchSize = Math.max(1, Math.min(cli.batch ?? maxFetch, maxFetch));
  const batches = chunk(ids, batchSize);

  let foundCount = 0;
  let missingCount = 0;

  console.log(
    `Backing up ${ids.length} IDs to ${cli.out}` + (cli.namespace ? ` (namespace="${cli.namespace}")` : '')
  );

  for (let i = 0; i < batches.length; i++) {
    const batchIds = batches[i];

    const res = cli.namespace
      ? await index.namespace(cli.namespace).fetch(batchIds)
      : await index.fetch(batchIds);

    // In this SDK, fetched items are under `records` (keyed by id)
    const records = res.records ?? {}; // type-safe: FetchResponse<RecordMetadata> has `records`

    for (const id of Object.keys(records)) {
      const r = records[id];

      await writeJsonl(outStream, {
        id,
        values: r.values,
        metadata: r.metadata,
        sparseValues: r.sparseValues,
        namespace: cli.namespace || '',
      });
    }

    foundCount += Object.keys(records).length;
    missingCount += batchIds.length - Object.keys(records).length;

    // Simple progress log
    if ((i + 1) % 5 === 0 || i === batches.length - 1) {
      console.log(`  ${i + 1}/${batches.length} batches — found so far: ${foundCount}, missing: ${missingCount}`);
    }
  }

  outStream.end();
  await once(outStream, 'finish');   // <-- ensures file is fully written
  console.log(`Done. Found: ${foundCount}, Missing: ${missingCount}. Output: ${cli.out}`);
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
