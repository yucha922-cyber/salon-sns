import "server-only";
import { fromGraphError, sanitize, SocialApiError } from "./errors";

/**
 * Minimal JSON client for Meta Graph-style APIs.
 *   - access tokens go in the POST body or as a query param on GETs; URLs are
 *     never logged or put into errors (sanitize()).
 *   - every call has a timeout; network failures become provider_unavailable.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface GraphClientOptions {
  baseUrl: string; // e.g. https://graph.instagram.com/v26.0
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export class GraphClient {
  private readonly fetchImpl: FetchLike;
  constructor(private readonly options: GraphClientOptions) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  url(path: string): string {
    return path.startsWith("http") ? path : `${this.options.baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  }

  async get<T>(path: string, params: Record<string, string>, context: string): Promise<T> {
    const qs = new URLSearchParams(params).toString();
    return this.request<T>(`${this.url(path)}?${qs}`, { method: "GET" }, context);
  }

  async post<T>(path: string, form: Record<string, string>, context: string): Promise<T> {
    return this.request<T>(
      this.url(path),
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() },
      context,
    );
  }

  private async request<T>(url: string, init: RequestInit, context: string): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000) });
    } catch (error) {
      throw new SocialApiError("provider_unavailable", sanitize(`${context}: network error ${(error as Error).name}`));
    }
    let body: unknown = null;
    const text = await response.text();
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { error: { message: text.slice(0, 200) } };
    }
    if (!response.ok || (body && typeof body === "object" && "error" in body && (body as { error: unknown }).error)) {
      throw fromGraphError(response.status, body, context, response.headers.get("retry-after"));
    }
    return body as T;
  }
}
