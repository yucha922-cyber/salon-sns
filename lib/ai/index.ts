import "server-only";
import { AnthropicProvider } from "./anthropic";
import { MockAIProvider } from "./mock";
import { OpenAIProvider } from "./openai";
import type { AIProvider } from "./provider";

/**
 * Picks the AI provider from server-only env vars:
 *   AI_PROVIDER=anthropic|openai|mock (explicit), otherwise the first
 *   provider with an API key, otherwise the mock provider.
 * API keys are read here only and never sent to the browser.
 */
export function getAIProvider(): AIProvider {
  const preferred = process.env.AI_PROVIDER?.trim().toLowerCase();
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (preferred === "mock") return new MockAIProvider();
  if (preferred === "anthropic" && anthropicKey) return new AnthropicProvider(anthropicKey);
  if (preferred === "openai" && openaiKey) return new OpenAIProvider(openaiKey);
  if (!preferred) {
    if (anthropicKey) return new AnthropicProvider(anthropicKey);
    if (openaiKey) return new OpenAIProvider(openaiKey);
  }
  return new MockAIProvider();
}

export type { AIProvider } from "./provider";
