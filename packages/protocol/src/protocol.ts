import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;
export const CAPABILITY_NOTICE =
  "Puedo recomendarte películas y, si lo deseas, compararlas con sus libros cuando exista información verificable.";
export const MAX_MESSAGE_LENGTH = 4000;
const id = z.string().uuid();
const base = { version: z.literal(PROTOCOL_VERSION) };

export const referenceSchema = z.discriminatedUnion("provider", [
  z.strictObject({ provider: z.literal("imdb"), id: z.string().regex(/^tt\d{7,10}$/) }),
  z.strictObject({ provider: z.literal("google-books"), id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) })
]);
export type Reference = z.infer<typeof referenceSchema>;

/** Construye destinos; nunca acepta una URL elegida por el modelo. */
export function referenceUrl(reference: Reference): string {
  const valid = referenceSchema.parse(reference);
  return valid.provider === "imdb"
    ? `https://www.imdb.com/title/${valid.id}/`
    : `https://books.google.com/books?id=${encodeURIComponent(valid.id)}`;
}

export const movieCardSchema = z.strictObject({
  id: z.number().int().positive(),
  title: z.string().min(1).max(300),
  year: z.number().int().min(1870).max(2100).nullable(),
  poster: z.string().regex(/^https:\/\/image\.tmdb\.org\/t\/p\/[A-Za-z0-9_]+\/[A-Za-z0-9_.-]+$/).nullable(),
  imdbId: z.string().regex(/^tt\d{7,10}$/).nullable()
});
export type MovieCard = z.infer<typeof movieCardSchema>;

export const clientFrameSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...base, type: z.literal("authenticate"), sessionId: id, token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }),
  z.strictObject({
    ...base, type: z.literal("user-message"), requestId: id,
    content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
    openReference: referenceSchema.optional()
  }),
  z.strictObject({ ...base, type: z.literal("cancel"), requestId: id })
]);
export type ClientFrame = z.infer<typeof clientFrameSchema>;
export type UserMessageFrame = Extract<ClientFrame, { type: "user-message" }>;

export const errorCodeSchema = z.enum([
  "invalid_frame", "unauthorized", "session_expired", "busy", "duplicate_request",
  "timeout", "cancelled", "unavailable", "policy_denied", "limit_exceeded"
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export const serverFrameSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...base, type: z.literal("session-ready"), sessionId: id, notice: z.string(), mode: z.enum(["ollama", "fixture"]) }),
  z.strictObject({ ...base, type: z.literal("agent-typing"), requestId: id, isTyping: z.boolean() }),
  z.strictObject({
    ...base, type: z.literal("agent-message"), requestId: id,
    message: z.strictObject({ id, content: z.string().min(1).max(8000), timestamp: z.string().datetime() }),
    movies: z.array(movieCardSchema).max(5), references: z.array(referenceSchema).max(20),
    actions: z.array(z.strictObject({ type: z.literal("open-reference"), reference: referenceSchema })).max(1)
  }),
  z.strictObject({
    ...base, type: z.literal("error"), requestId: id.optional(),
    code: errorCodeSchema, message: z.string(), retryable: z.boolean()
  })
]);
export type ServerFrame = z.infer<typeof serverFrameSchema>;
export type AgentMessageFrame = Extract<ServerFrame, { type: "agent-message" }>;
export const sessionCredentialsSchema = z.strictObject({
  version: z.literal(1), sessionId: id, token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresInSeconds: z.number().int().positive(), websocketPath: z.literal("/chat")
});

export function parseClientFrame(value: string): ClientFrame {
  return clientFrameSchema.parse(JSON.parse(value) as unknown);
}
export function parseServerFrame(value: string): ServerFrame {
  return serverFrameSchema.parse(JSON.parse(value) as unknown);
}
