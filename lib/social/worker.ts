import "server-only";
import type { ID } from "@/lib/domain/types";
import { getSystemRepository, getSystemStore } from "./access";
import { refreshExpiringTokens } from "./connections";
import { syncInsights, type SyncSummary } from "./insights-sync";
import { processDueJobs, type ProcessSummary } from "./publish-queue";

export type TickTask = "all" | "publish" | "insights" | "tokens";

export interface TickResult {
  ok: boolean;
  publish?: ProcessSummary;
  insights?: SyncSummary;
  tokens?: { refreshed: number; failed: number };
  error?: string;
}

/**
 * One scheduler tick. Provider-agnostic: called by /api/cron/social from
 * Supabase Cron (pg_cron + pg_net, every minute — recommended), Vercel Cron,
 * GitHub Actions or any HTTP scheduler; in Demo Mode also lazily from pages.
 * Idempotent and safe to run concurrently (jobs are claimed with conditional
 * updates).
 */
export async function runSocialTick(options: { task?: TickTask; organizationId?: ID; now?: Date } = {}): Promise<TickResult> {
  const store = getSystemStore();
  if (!store) return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not configured" };
  const task = options.task ?? "all";
  const result: TickResult = { ok: true };
  if (task === "all" || task === "publish") {
    result.publish = await processDueJobs(store, { now: options.now, organizationId: options.organizationId, timeBudgetMs: 40_000 });
  }
  if (task === "all" || task === "insights") {
    result.insights = await syncInsights(store, { now: options.now, organizationId: options.organizationId, repo: getSystemRepository() });
  }
  if (task === "all" || task === "tokens") {
    result.tokens = await refreshExpiringTokens(store, options.now);
  }
  return result;
}
