// src/scripts/clearPineconeIndex.ts
//    npx ts-node -r dotenv/config src/scripts/clearPineconeIndex.ts

import 'dotenv/config';
import readline from 'readline';
import { Pinecone } from '@pinecone-database/pinecone';

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(question, ans => { rl.close(); res(ans.trim()); }));
}

function nsCount(ns: any): number {
  if (!ns) return 0;
  if (typeof ns.vectorCount === 'number') return ns.vectorCount;   // older SDK shape
  if (typeof ns.recordCount === 'number') return ns.recordCount;   // newer SDK shape
  return 0;
}

async function deleteDefaultNamespace(index: any) {
  // Prefer modern APIs first
  if (typeof index.deleteAll === 'function') {
    // Newer SDK: delete all in the default namespace
    await index.deleteAll();
    return;
  }
  if (typeof index.namespace === 'function') {
    // Newer SDK w/ namespaces
    const ns = index.namespace('__default__');
    if (ns && typeof ns.deleteAll === 'function') {
      await ns.deleteAll();
      return;
    }
    // Some builds use '' for default
    const nsEmpty = index.namespace('');
    if (nsEmpty && typeof nsEmpty.deleteAll === 'function') {
      await nsEmpty.deleteAll();
      return;
    }
  }

  // Legacy fallbacks
  if (typeof index.delete1 === 'function') {
    await index.delete1({ deleteAll: true, namespace: '' });
    return;
  }
  if (typeof index['delete'] === 'function') {
    await index['delete']({ deleteAll: true, namespace: '' });
    return;
  }

  throw new Error('No compatible delete method found on Pinecone index (deleteAll / namespace(...).deleteAll / delete1).');
}

async function main() {
  const indexName = process.env.PINECONE_INDEX_NAME_DEV!;
  const apiKey = process.env.PINECONE_API_KEY!;
  const host = process.env.PINECONE_INDEX_HOST_DEV!;
  if (!indexName || !apiKey || !host) {
    throw new Error('Missing PINECONE vars in env (need PINECONE_API_KEY, PINECONE_INDEX_NAME_DEV, PINECONE_INDEX_HOST_DEV)');
  }

  const pc = new Pinecone({ apiKey });
  // Many SDK builds accept (name, host); others accept (name) only — your current one supports (name, host)
  const index: any = pc.index(indexName, host);

  const stats = await index.describeIndexStats();
  const dim = (stats as any).dimension;
  const namespaces = (stats as any).namespaces ?? {};

  console.log(`\nIndex: ${indexName}`);
  console.log(`Dimension: ${dim}`);
  console.log(`Namespaces (${Object.keys(namespaces).length}):`);
  for (const [ns, info] of Object.entries(namespaces)) {
    const label = ns === '' ? '__default__' : ns;
    console.log(`  - ${label}: ${nsCount(info)} vectors`);
  }

  const defaultCount = nsCount(namespaces[''] ?? null);
  console.log('\nThis will DELETE ALL VECTORS from the DEFAULT namespace (__default__).');
  const cont = await ask(
    defaultCount === 0
      ? 'Default namespace is empty. Type YES to proceed anyway: '
      : `Type YES to delete ${defaultCount} vectors from __default__: `
  );
  if (cont !== 'YES') return console.log('Aborted.');

  console.log('\nDeleting __default__ namespace contents…');
  await deleteDefaultNamespace(index);

  const after = await index.describeIndexStats();
  const afterCount = nsCount(((after as any).namespaces ?? {})[''] ?? null);
  console.log(`✅ Done. __default__ now has ${afterCount} vectors.\n`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
