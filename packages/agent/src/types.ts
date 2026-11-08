import type { MovieCard, Reference } from "@agichat/protocol";

export interface ToolCall { readonly name: string; readonly arguments: Record<string, unknown> }
export interface ModelMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  readonly toolCalls?: readonly ToolCall[];
  readonly toolName?: string;
}
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}
export interface ModelReply { readonly content: string; readonly toolCalls: readonly ToolCall[] }
export interface LanguageModel {
  complete(messages: readonly ModelMessage[], tools: readonly ToolDefinition[], signal: AbortSignal): Promise<ModelReply>;
}
export interface ToolResult { readonly data: unknown; readonly isError: boolean }
export interface ToolSession {
  readonly tools: readonly ToolDefinition[];
  call(call: ToolCall, signal: AbortSignal): Promise<ToolResult>;
  close(): Promise<void>;
}
export interface ToolGateway { open(signal: AbortSignal): Promise<ToolSession> }
export interface ConversationTurn {
  readonly user: string;
  readonly assistant: string;
  readonly references: readonly Reference[];
}
export interface AgentReply {
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
  public constructor(public readonly code: "policy_denied" | "limit_exceeded" | "unavailable") {
    super(code);
    this.name = "AgentError";
  }
}
