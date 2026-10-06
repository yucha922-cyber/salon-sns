import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { AIProviderError, type AIProvider, type GenerateObjectRequest, type GenerateTextRequest } from "./provider";

const DEFAULT_MODEL = "claude-opus-5-5";
// Server-side refusal fallback: if the model declines, the API re-runs the
// request on a fallback model chosen by refusal category.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generateText(request: GenerateTextRequest): Promise<{ text: string }> {
    const response = await this.call(() =>
      this.client.beta.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 16000,
        system: request.system,
        messages: request.messages,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
      }),
    );
    assertNotRefused(response);
    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();
    if (!text) throw new AIProviderError("empty response", "invalid_output");
    return { text };
  }

  async generateStructuredObject<T>(request: GenerateObjectRequest<T>): Promise<{ object: T }> {
    const response = await this.call(() =>
      this.client.beta.messages.parse({
        model: this.model,
        max_tokens: request.maxTokens ?? 16000,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
        output_config: { format: betaZodOutputFormat(request.schema) },
        betas: [FALLBACK_BETA],
        fallbacks: "default",
      }),
    );
    assertNotRefused(response);
    const parsed = request.schema.safeParse(response.parsed_output);
    if (!parsed.success) throw new AIProviderError("structured output did not match schema", "invalid_output");
    return { object: parsed.data };
  }

  private async call<R>(fn: () => Promise<R>): Promise<R> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) throw new AIProviderError("rate limited", "rate_limited");
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        throw new AIProviderError("invalid Anthropic API key", "auth");
      }
      if (error instanceof Anthropic.APIError) {
        throw new AIProviderError(`Anthropic API error ${error.status ?? ""}`.trim(), "unavailable");
      }
      throw error;
    }
  }
}

function assertNotRefused(response: BetaMessage): void {
  if (response.stop_reason === "refusal") {
    throw new AIProviderError("the model declined this request", "refusal");
  }
}
