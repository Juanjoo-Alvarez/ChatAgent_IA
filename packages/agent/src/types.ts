import type { MovieCard, Reference } from "@agichat/protocol";

export interface ToolCall { readonly id?: string; readonly name: string; readonly arguments: Record<string, unknown> }
export interface ModelMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  readonly toolCalls?: readonly ToolCall[];
  readonly toolName?: string;
  readonly toolCallId?: string;
}
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}
export interface ModelReply { readonly content: string; readonly toolCalls: readonly ToolCall[] }
export interface LanguageModel {
  complete(messages: readonly ModelMessage[], tools: readonly ToolDefinition[], signal: AbortSignal, onInference?: () => void): Promise<ModelReply>;
}
export interface ToolResult { readonly data: unknown; readonly isError: boolean; readonly error?: AgentError }
export interface ToolSession {
  readonly tools: readonly ToolDefinition[];
  call(call: ToolCall, signal: AbortSignal): Promise<ToolResult>;
  close(): Promise<void>;
}
export interface ToolGateway { open(signal: AbortSignal): Promise<ToolSession> }
export interface RecommendationCandidate {
  readonly id: number;
  readonly title: string;
  readonly year: number | null;
  readonly release_date: string | null;
  readonly poster: string | null;
  readonly imdb_id: string | null;
  readonly original_title: string;
  readonly overview: string;
  readonly genres: readonly string[];
  readonly rating: number | null;
  readonly vote_count: number | null;
}
export interface EvidenceContext {
  readonly awaitingPreferences?: boolean;
  readonly comparisonStatus?: "adaptation_identified" | "possible_match" | "insufficient_evidence";
  readonly movies: readonly MovieCard[];
  readonly books: readonly { readonly id: string; readonly title: string; readonly authors: readonly string[] }[];
  readonly recommendation?: {
    readonly criteria: Readonly<Record<string, unknown>>;
    readonly page: number;
    readonly shownIds: readonly number[];
    readonly reason: string;
    readonly originalTitle: string;
    readonly releaseDate: string | null;
    readonly pending: readonly RecommendationCandidate[];
    readonly totalPages: number;
    readonly fixture: boolean;
  };
}
export interface ConversationTurn {
  readonly user: string;
  readonly assistant: string;
  readonly references: readonly Reference[];
  readonly movies?: readonly MovieCard[];
  readonly context?: EvidenceContext;
}
export interface AgentReply {
  readonly context?: EvidenceContext;
  readonly content: string;
  readonly movies: readonly MovieCard[];
  readonly references: readonly Reference[];
  readonly actions: readonly { readonly type: "open-reference"; readonly reference: Reference }[];
}
export interface ChatAgent {
  respond(input: {
    readonly content: string;
    readonly history: readonly ConversationTurn[];
    readonly openReference?: Reference;
    readonly signal: AbortSignal;
  }): Promise<AgentReply>;
}

export class AgentError extends Error {
  public constructor(public readonly code: "policy_denied" | "limit_exceeded" | "unavailable" | "rate_limited" | "timeout",
    public readonly source?: "tmdb" | "google-books" | "wikidata") {
    super(code);
    this.name = "AgentError";
  }
}
