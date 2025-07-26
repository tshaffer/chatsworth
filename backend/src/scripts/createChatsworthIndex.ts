import dotenv from 'dotenv';
dotenv.config();

import { CreateIndexOptions, Pinecone } from '@pinecone-database/pinecone';

const apiKey = process.env.PINECONE_API_KEY;
console.log('apiKey:', apiKey);

const pc = new Pinecone({
  apiKey
});

const indexName = 'chatsworth-chatentries-2';

async function main() {
  try {

    const existing = await pc.listIndexes();
    console.log('Existing indexes:', existing);

    // const createIndexOptions: CreateIndexOptions = {
    //   name: indexName,
    //   dimension: 1536,
    //   metric: 'cosine',
    //   spec: undefined, // You can specify additional options here if needed
    //   waitUntilReady: true,
    // };

    // await pc.createIndex(createIndexOptions);


    await pc.createIndex({
      name: indexName,
      vectorType: 'dense',
      // dimension: 1536,
      dimension: 8,
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1'
        }
      },
      deletionProtection: 'disabled',
      tags: { environment: 'development' },
    });

    const updatedIndices = await pc.listIndexes();
    console.log('Updated indexes:', updatedIndices);

    // await pc.createIndexForModel({
    //   name: indexName,
    //   cloud: 'aws',
    //   region: 'us-east-1',
    //   embed: {
    //     model: 'llama-text-embed-v2',
    //     fieldMap: { text: 'chunk_text' },
    //   },
    //   waitUntilReady: true,
    // });

    // console.log(`Index ${indexName} created successfully.`);
  } catch (error) {
    console.error('Error creating index:', error);
  }
}

main();

/*
import { Pinecone } from '@pinecone-database/pinecone'

const pc = new Pinecone({ apiKey: 'YOUR_API_KEY' });

await pc.createIndex({
  name: 'standard-dense-js',
  vectorType: 'dense',
  dimension: 1536,
  metric: 'cosine',
  spec: {
    serverless: {
      cloud: 'aws',
      region: 'us-east-1'
    }
  },
  deletionProtection: 'disabled',
  tags: { environment: 'development' }, 
});
*/

/*
import { Pinecone } from '@pinecone-database/pinecone'

const pc = new Pinecone({ apiKey: 'YOUR_API_KEY' });

await pc.createIndex({
  name: 'standard-sparse-js',
  vectorType: 'sparse',
  metric: 'dotproduct',
  spec: {
    serverless: {
      cloud: 'aws',
      region: 'us-east-1'
    },
  },
});*/