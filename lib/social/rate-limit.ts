import "server-only";

/**
 * Per-user rate limiting for actions that call Meta / the AI provider
 * (publish now, insights sync, AI review, OAuth start, manual queue run).
 * In-memory sliding window per server instance — a guard against
 * accidental double-clicks and scripted abuse, not a global quota
 * (Meta's own limits are handled by the queue's retry/backoff).
 */
const g = globalThis as unknown as { __naoruRate?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__naoruRate ??= new Map<string, number[]>());

export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterSeconds: Math.ceil((windowMs - (now - (recent[0] ?? now))) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return { ok: true };
}

export const RATE_LIMITS = {
  publishNow: { limit: 10, windowMs: 60_000 },
  insightsSync: { limit: 20, windowMs: 60_000 },
  aiReview: { limit: 10, windowMs: 60_000 },
  connect: { limit: 10, windowMs: 60_000 },
  runQueue: { limit: 6, windowMs: 60_000 },
} as const;

export function rateLimitMessage(seconds: number): string {
  return `操作が多すぎます。${seconds}秒ほど待ってから再度お試しください。`;
}
