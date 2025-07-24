import { Request, Response } from 'express';
import { ProjectModel } from '../models/Project';

export const searchRoutes = async (
  req: Request,
  res: Response
) => {
const { query } = req.query;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing search query' });
  }

  try {
    const results = await ProjectModel.find(
      { $text: { $search: query } },
      { score: { $meta: 'textScore' } }
    )
    .sort({ score: { $meta: 'textScore' } })
    .lean();

    res.json(results);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
};
