// src/services/openaiClient.ts
import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function embedText(
  text: string,
  model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
): Promise<number[]> {
  const resp = await openai.embeddings.create({ model, input: text });
  return resp.data[0].embedding as number[];
}

export default embedText; // optional default export
