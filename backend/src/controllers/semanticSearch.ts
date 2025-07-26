import express, { Request, Response } from 'express';
import { getEmbedding } from '../utilities/embed';
import { pinecone } from '../pineconeClient';
import { ChatEntryModel } from '../models/ChatEntry';

export const semanticSearchRoute = async (
  req: Request,
  res: Response
) => {

  const query = req.body.query;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid query' });
  }

  try {
    const queryVector = await getEmbedding(query);

    const index = pinecone.index(process.env.PINECONE_INDEX_NAME, process.env.PINECONE_INDEX_HOST)

    const result = await index.query({
      topK: 10,
      vector: queryVector,
      includeMetadata: true,
    });

    const matches = result.matches || [];

    // Optionally: hydrate full ChatEntry documents from MongoDB
    const ids = matches.map((m) => m.id);
    const entries = await ChatEntryModel.find({
      _id: { $in: ids },
    });

    // Sort results to match original Pinecone match order
    const entryMap: { [id: string]: typeof entries[0] } = {};
    entries.forEach((e: any) => {
      entryMap[e._id.toString()] = e;
    });
    const sortedResults = matches.map((m) => ({
      score: m.score,
      entry: entryMap[m.id] || null,
    })).filter((r) => r.entry !== null);

    res.json({ results: sortedResults });
  } catch (err) {
    console.error('Semantic search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
};