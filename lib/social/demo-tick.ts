import "server-only";
import type { DataRepository } from "@/lib/data/repository";
import type { ID } from "@/lib/domain/types";
import { getDataMode } from "@/lib/env";
import { DemoSocialStore } from "./demo-store";
import { syncInsights } from "./insights-sync";
import { processDueJobs } from "./publish-queue";

const g = globalThis as unknown as { __naoruDemoTick?: Map<ID, number> };
const last = (g.__naoruDemoTick ??= new Map());

/**
 * Demo Mode has no per-instance background scheduler, so due jobs and insight
 * checkpoints are processed lazily when someone opens a page (≤ every 30s per
 * organization). Production uses /api/cron/social instead.
 */
export async function runDemoTickIfDue(organizationId: ID, repo: DataRepository): Promise<void> {
  if (getDataMode() !== "demo") return;
  const now = Date.now();
  if (now - (last.get(organizationId) ?? 0) < 30_000) return;
  last.set(organizationId, now);
  try {
    const store = new DemoSocialStore();
    await processDueJobs(store, { organizationId, limit: 10, timeBudgetMs: 8_000 });
    await syncInsights(store, { organizationId, repo, maxReviews: 1, maxPosts: 20 });
  } catch (error) {
    console.error("[demo-tick]", error instanceof Error ? error.message : error);
  }
}
