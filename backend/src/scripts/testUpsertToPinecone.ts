// testPineconeUpsert.ts
import dotenv from 'dotenv';
dotenv.config();

import { Pinecone } from '@pinecone-database/pinecone'; // Make sure this import matches your pineconeClient.ts

async function runMinimalUpsertTest() {
  const apiKey = process.env.PINECONE_API_KEY;
  const pineconeIndexHost = process.env.PINECONE_INDEX_HOST;

  console.log('--- Minimal Pinecone Upsert Test ---');
  console.log('API Key:', apiKey ? 'Loaded' : 'MISSING');
  console.log('Index Host:', pineconeIndexHost ? pineconeIndexHost : 'MISSING');

  if (!apiKey) {
    console.error('Error: PINECONE_API_KEY is not set in .env');
    process.exit(1);
  }
  if (!pineconeIndexHost) {
    console.error('Error: PINECONE_INDEX_HOST is not set in .env');
    process.exit(1);
  }

try {
    const pinecone = new Pinecone({
      apiKey: apiKey,
    });
    console.log('Main Pinecone client initialized.');

    const index = pinecone.Index(pineconeIndexHost);
    console.log('Pinecone index client obtained using host:', pineconeIndexHost);

    // Deep inspection of the index object
    console.log('--- Inspecting Index Object ---');
    console.log('Index Type:', index.constructor.name);
    // Be careful with JSON.stringify on complex objects, it might throw or be very large
    // console.log('Index Object (Partial):', JSON.stringify(index, getCircularReplacer(), 2)); 
    console.log('Index Host (from object):', index.host); // This should be the same as pineconeIndexHost
    console.log('Index upsert method:', typeof index.upsert); // Should be 'function'
    console.log('--- End Index Object Inspection ---');

    const testVector = {
      id: `test-vector-${Date.now()}`,
      values: Array.from({ length: 1024 }, () => Math.random() * 2 - 1),
      metadata: {
        source: 'minimal-test-script',
        timestamp: new Date().toISOString(),
      },
    };

        console.log('Attempting to upsert test vector (ID):', testVector.id);
    console.log('Attempting to upsert test vector (values length):', testVector.values.length);
    console.log('Attempting to upsert test vector (metadata):', JSON.stringify(testVector.metadata));

    await index.upsert([testVector]);
    console.log('✅ Minimal upsert successful!');

  } catch (error) {
    console.error('❌ Error during minimal upsert test:', error);
  } finally {
    console.log('--- Test Finished ---');
    process.exit(0);
  }
}

runMinimalUpsertTest();

// Helper for stringifying objects with circular references (optional, use with caution)
function getCircularReplacer() {
  const seen = new WeakSet();
  return (key: any, value: any) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
  };
}






