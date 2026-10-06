import "server-only";
import type { AIProvider, GenerateObjectRequest, GenerateTextRequest } from "./provider";

/**
 * Used when no AI API key is configured. Returns the feature's own
 * brand-aware mock (built from buildBrandContext), validated against the
 * same schema real providers must satisfy.
 */
export class MockAIProvider implements AIProvider {
  readonly name = "mock" as const;

  async generateText(request: GenerateTextRequest): Promise<{ text: string }> {
    await delay(350);
    return { text: request.mockResponse() };
  }

  async generateStructuredObject<T>(request: GenerateObjectRequest<T>): Promise<{ object: T }> {
    await delay(500);
    return { object: request.schema.parse(request.mockResponse()) };
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, process.env.NODE_ENV === "test" ? 0 : ms));
}
