import { z } from "zod";

export const bookIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const bookSchema = z.strictObject({
  id: bookIdSchema,
  title: z.string().nullable(), authors: z.array(z.string()),
  description: z.string().nullable(), published_date: z.string().nullable(),
  identifiers: z.array(z.strictObject({ type: z.string(), identifier: z.string() })),
  reference: z.strictObject({ provider: z.literal("google-books"), id: bookIdSchema }),
  url: z.string().url(),
  provenance: z.strictObject({ source: z.literal("google-books"), trust: z.literal("untrusted_external"), suspected_instructions: z.boolean() })
});
export type Book = z.infer<typeof bookSchema>;
export const searchBooksInput = z.strictObject({
  query: z.string().trim().min(1).max(300),
  start_index: z.number().int().min(0).max(1000).default(0),
  max_results: z.number().int().min(1).max(40).default(10)
});
export const preferencesSchema = z.strictObject({
  genres: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  min_rating: z.number().min(0).max(10).optional(),
  requires_fidelity: z.boolean().default(false)
});
export const compareInput = z.strictObject({
  movie_id: z.number().int().positive(), book_id: bookIdSchema,
  preferences: preferencesSchema.default({ genres: [], requires_fidelity: false })
});
export const claimSchema = z.strictObject({ text: z.string(), sources: z.array(z.string().url()).min(1) });
export const comparisonSchema = z.strictObject({
  status: z.enum(["adaptation_identified", "possible_match", "insufficient_evidence"]),
  reasons: z.array(z.string()), similarities: z.array(claimSchema), differences: z.array(claimSchema),
  recommendation: z.strictObject({ verdict: z.enum(["consider", "not_recommended", "undetermined"]), reasons: z.array(z.string()) }),
  limitations: z.array(z.string()), sources: z.array(z.string().url()),
  references: z.array(z.strictObject({ provider: z.literal("google-books"), id: bookIdSchema })),
  book: bookSchema, movie_id: z.number().int().positive()
});
