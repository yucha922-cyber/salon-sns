import "server-only";
import { z } from "zod";
import { AIProviderError, type AIProvider, type GenerateObjectRequest, type GenerateTextRequest } from "./provider";

const DEFAULT_MODEL = "gpt-4.1-mini";

const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({ content: z.string().nullable(), refusal: z.string().nullable().optional() }),
      }),
    )
    .min(1),
});

/** OpenAI Chat Completions over HTTPS (kept dependency-free on purpose). */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.OPENAI_MODEL || DEFAULT_MODEL,
  ) {}

  async generateText(request: GenerateTextRequest): Promise<{ text: string }> {
    const content = await this.complete({
      messages: [{ role: "system", content: request.system }, ...request.messages],
      max_completion_tokens: request.maxTokens ?? 4000,
    });
    return { text: content };
  }

  async generateStructuredObject<T>(request: GenerateObjectRequest<T>): Promise<{ object: T }> {
    const content = await this.complete({
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.prompt },
      ],
      max_completion_tokens: request.maxTokens ?? 4000,
      response_format: {
        type: "json_schema",
        json_schema: { name: request.schemaName, schema: z.toJSONSchema(request.schema), strict: true },
      },
    });
    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      throw new AIProviderError("structured output was not valid JSON", "invalid_output");
    }
    const parsed = request.schema.safeParse(json);
    if (!parsed.success) throw new AIProviderError("structured output did not match schema", "invalid_output");
    return { object: parsed.data };
  }

  private async complete(body: Record<string, unknown>): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, ...body }),
    });
    if (res.status === 401 || res.status === 403) throw new AIProviderError("invalid OpenAI API key", "auth");
    if (res.status === 429) throw new AIProviderError("rate limited", "rate_limited");
    if (!res.ok) throw new AIProviderError(`OpenAI API error ${res.status}`, "unavailable");
    const data = completionSchema.parse(await res.json());
    const message = data.choices[0]?.message;
    if (message?.refusal) throw new AIProviderError("the model declined this request", "refusal");
    const content = message?.content?.trim();
    if (!content) throw new AIProviderError("empty response", "invalid_output");
    return content;
  }
}
