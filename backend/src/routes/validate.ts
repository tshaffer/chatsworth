import { ZodSchema } from 'zod';
import { Request, Response, NextFunction } from 'express';

type Source = 'body' | 'query' | 'params';

export function validate<T>(
  schema: ZodSchema<T>,
  source: Source = 'body'
) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const value = schema.parse(req[source]);
      // stash the parsed value so controllers can read typed data
      (req as any).validated = { ...(req as any).validated, [source]: value };
      next();
    } catch (err: any) {
      // Central error handler will format this
      err.statusCode = 400;
      next(err);
    }
  };
}
