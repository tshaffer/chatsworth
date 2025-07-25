import { Request, Response } from 'express';
import { Configuration, OpenAIApi } from 'openai';
import { ChatEntryModel } from '../models';

const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));

async function embedText(text: string): Promise<number[]> {
  const response = await openai.createEmbedding({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data.data[0].embedding;
}

export const embedTextEndpoint = async (req: Request, res: Response) => {
  const entries = await ChatEntryModel.find({ embedding: { $exists: false } });
  for (const entry of entries) {
    const embedding = await embedText(entry.content);
    entry.embedding = embedding;
    await entry.save();
  }
};
