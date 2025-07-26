import dotenv from 'dotenv';
dotenv.config();

import { Pinecone } from '@pinecone-database/pinecone'

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

// To get the unique host for an index, 
// see https://docs.pinecone.io/guides/manage-data/target-an-index
const index = pinecone.index("chatsworth-chatentries-2", process.env.PINECONE_INDEX_HOST)
console.log('index 0', index);

const records = [
  {
    id: 'A',
    values: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
    metadata: { genre: "comedy", year: 2020 },
  },
  {
    id: 'B',
    values: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
    metadata: { genre: "documentary", year: 2019 },
  },
  {
    id: 'C',
    values: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
    metadata: { genre: "comedy", year: 2019 },
  },
  {
    id: 'D',
    values: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
    metadata: { genre: "drama" },
  }
]

async function main() {

  // const indexName = 'chatsworth-chatentries';
  // const index = pinecone.index(indexName).namespace("example-namespace");
  console.log('index 1', index);

  index.upsert(records).then(() => {
    console.log('Records upserted successfully');
  }).catch(err => {
    console.error('Error upserting records:', err);
  });

  const foo = index.namespace('example-namespace');

  // foo.upsert(records).then(() => {
  //   console.log('Records upserted successfully');
  // }).catch(err => {
  //   console.error('Error upserting records:', err);
  // });
  // const index = pinecone.index('chatsworth-chatentries-1').namespace('example-namespace')
  // index.upsert(records);
}

main();
console.log('return from main');
