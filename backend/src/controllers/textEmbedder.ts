import { Request, Response } from 'express';
import OpenAI from 'openai';
import { ChatEntryModel } from '../models';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small', // or 'text-embedding-ada-002'
    input: text,
  });

  return response.data[0].embedding;
}

export const embedTextEndpoint = async (req: Request, res: Response) => {
  try {
    const entries = await ChatEntryModel.find({ embedding: { $exists: false } });

    let updatedCount = 0;

    for (const entry of entries) {
      const text = [entry.originalPrompt, entry.promptSummary, entry.response]
        .filter(Boolean)
        .join('\n');

      const embedding = await getEmbedding(text);
      entry.embedding = embedding;
      await entry.save();
      updatedCount++;
    }

    res.json({ message: `✅ Embedded ${updatedCount} entries.` });
  } catch (error) {
    console.error('Embedding error:', error);
    res.status(500).json({ error: 'Embedding failed.' });
  }
};
