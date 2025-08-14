import { z } from 'zod';

export const SearchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Query must be at least 2 characters').max(200),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SemanticSearchBodySchema = z.object({
  query: z.string().trim().min(2, 'Query must be at least 2 characters').max(200),
  topK: z.number().int().min(1).max(100).optional().default(10),
});

export type SemanticSearchBody = z.infer<typeof SemanticSearchBodySchema>;
