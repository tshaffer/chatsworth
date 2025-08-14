import { Request, Response, NextFunction } from 'express';
import { ProjectModel } from '../models/Project';
import { SearchQuery } from '../routes/schemas';

export async function textSearch(req: Request, res: Response, next: NextFunction) {
  try {
    const { q } = (req as any).validated.query as SearchQuery;

    const results = await ProjectModel.find(
      { $text: { $search: q } },
      { score: { $meta: 'textScore' }, id: 1, name: 1, chats: 1, _id: 0 }
    )
      .sort({ score: { $meta: 'textScore' } })
      .lean();

    res.json({ results });
  } catch (err) {
    next(err);
  }
}