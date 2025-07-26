import dotenv from 'dotenv';
dotenv.config();

import { Pinecone } from '@pinecone-database/pinecone';

const apiKey = process.env.PINECONE_API_KEY;
console.log('apiKey:', apiKey);

const pc = new Pinecone({
  apiKey
});

const indexName = 'chatsworth-chatentries-dev';

async function main() {
  try {

    const existing = await pc.listIndexes();
    console.log('Existing indexes:', existing);

    await pc.createIndex({
      name: indexName,
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

    const updatedIndices = await pc.listIndexes();
    console.log('Updated indexes:', updatedIndices);

  } catch (error) {
    console.error('Error creating index:', error);
  }
}

main();

