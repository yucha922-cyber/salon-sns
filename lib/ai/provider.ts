import type { z } from "zod";

/**
 * Provider-agnostic AI interface. Features (chat, post creator, ...) depend
 * only on this, never on a vendor SDK. Implementations live next to it:
 * anthropic.ts, openai.ts, mock.ts. All of them are server-only.
 */
export type AIProviderName = "mock" | "anthropic" | "openai";

export interface AIChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateTextRequest {
  system: string;
  messages: AIChatTurn[];
  maxTokens?: number;
  /** Deterministic answer used by MockAIProvider (no API key / tests). */
  mockResponse: () => string;
}

export interface GenerateObjectRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Short identifier for the output schema (used by some providers). */
  schemaName: string;
  maxTokens?: number;
  mockResponse: () => T;
}

export interface AIProvider {
  readonly name: AIProviderName;
  generateText(request: GenerateTextRequest): Promise<{ text: string }>;
  generateStructuredObject<T>(request: GenerateObjectRequest<T>): Promise<{ object: T }>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly kind: "refusal" | "invalid_output" | "rate_limited" | "auth" | "unavailable",
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
