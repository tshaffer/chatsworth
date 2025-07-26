import dotenv from 'dotenv';
dotenv.config();

import { Pinecone } from '@pinecone-database/pinecone';

const apiKey = process.env.PINECONE_API_KEY;
console.log('apiKey:', apiKey);

const pc = new Pinecone({
  apiKey
});

const indexName = 'developer-quickstart-js';

async function main() {
  try {
    await pc.createIndexForModel({
      name: indexName,
      cloud: 'aws',
      region: 'us-east-1',
      embed: {
        model: 'llama-text-embed-v2',
        fieldMap: { text: 'chunk_text' },
      },
      waitUntilReady: true,
    });

    console.log(`Index ${indexName} created successfully.`);
  } catch (error) {
    console.error('Error creating index:', error);
  }
}

main();