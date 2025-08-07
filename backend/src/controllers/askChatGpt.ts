// routes/askChatGpt.ts
import { Request, Response } from 'express';
import { getEmbedding } from '../utilities/embed';
import { ChatEntryModel } from '../models/ChatEntry';
import openai from '../services/openaiClient';
import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config();

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pinecone.index(
  process.env.PINECONE_INDEX_NAME_DEV!,
  process.env.PINECONE_INDEX_HOST_DEV!
);

export const askChatGptHandler = async (req: Request, res: Response) => {
  const { question, projectId } = req.body;

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid question' });
  }

  try {
    const queryEmbedding = await getEmbedding(question);

    const filter = projectId ? { projectId } : undefined;
    const pineconeResponse = await index.query({
      vector: queryEmbedding,
      topK: 10,
      includeMetadata: true,
      filter,
    });

    const matches = pineconeResponse.matches || [];
    if (matches.length === 0) {
      return res.json({ answer: 'No relevant context found to answer your question.', sourceEntries: [] });
    }

    const entryIds = matches.map((m) => m.id);
    const entries = await ChatEntryModel.find({ _id: { $in: entryIds } }).lean();

    const entryById = new Map(entries.map((e: any) => [e._id.toString(), e]));
    const orderedEntries = entryIds
      .map((id) => entryById.get(id))
      .filter((e): e is typeof entries[number] => !!e);

    const contextChunks = orderedEntries.map((entry) => {
      return `Prompt: ${entry.originalPrompt}\nResponse: ${entry.response}`;
    });

    const contextText = contextChunks.join('\n\n');
    const systemPrompt = `You are an assistant answering questions based on previous conversations. Use only the context provided.`;
    const userPrompt = `Context:\n${contextText}\n\nQuestion: ${question}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const answer = completion.choices[0].message.content;

    res.json({ answer, sourceEntries: orderedEntries });
  } catch (err) {
    console.error('Error in askChatGptHandler:', err);
    res.status(500).json({ error: 'Failed to get ChatGPT response' });
  }
};
