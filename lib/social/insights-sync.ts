import "server-only";
import type { DataRepository } from "@/lib/data/repository";
import type { ID } from "@/lib/domain/types";
import { SocialApiError } from "./errors";
import { reviewPostPerformance } from "./performance";
import { getSocialProvider } from "./registry";
import type { SocialStore } from "./store";
import type { MetricSnapshot, PublishJob } from "./types";

/**
 * Insights sync (Measure). Rate-limit friendly schedule:
 *   per post: snapshots at ≈1h, 24h, 3d, 7d, 14d, 30d after publishing
 *             (≤ 6 calls per post lifetime; never overwritten → time series)
 *   per account: one account-level snapshot per ~20h (followers, reach, …)
 * Meta notes insights can lag up to ~48h, so later checkpoints are kept.
 * After the 3-day checkpoint the AI Performance Review runs automatically
 * (max N per run to bound AI cost).
 */
export const POST_CHECKPOINT_HOURS = [1, 24, 72, 168, 336, 720];
const ACCOUNT_SYNC_HOURS = 20;
const AUTO_REVIEW_AFTER_HOURS = 72;

export function dueCheckpoint(hoursSincePublish: number, lastSnapshotHours: number | null): number | null {
  const reached = POST_CHECKPOINT_HOURS.filter((h) => h <= hoursSincePublish);
  const target = reached[reached.length - 1];
  if (target === undefined) return null;
  if (lastSnapshotHours !== null && lastSnapshotHours >= target) return null;
  return target;
}

export interface SyncSummary {
  postSnapshots: number;
  accountSnapshots: number;
  reviews: number;
  errors: number;
}

export async function syncInsights(
  store: SocialStore,
  options: { now?: Date; organizationId?: ID; postId?: ID; repo?: DataRepository | null; maxPosts?: number; maxReviews?: number; force?: boolean } = {},
): Promise<SyncSummary> {
  const now = options.now ?? new Date();
  const summary: SyncSummary = { postSnapshots: 0, accountSnapshots: 0, reviews: 0, errors: 0 };
  const jobs = (await store.systemListPublishedJobs(new Date(now.getTime() - 31 * 86_400_000).toISOString(), options.organizationId)).filter(
    (j) => !options.postId || j.postId === options.postId,
  );
  const byOrg = new Map<ID, PublishJob[]>();
  for (const j of jobs) byOrg.set(j.organizationId, [...(byOrg.get(j.organizationId) ?? []), j]);
  let budget = options.maxPosts ?? 50;
  let reviewBudget = options.maxReviews ?? 3;

  for (const [org, orgJobs] of byOrg) {
    const meta = await store.getOrganizationMeta(org);
    if (!meta) continue;
    const snapshots = await store.listSnapshots(org, { postIds: orgJobs.map((j) => j.postId), scope: "post" });
    const lastByPost = new Map<ID, MetricSnapshot>();
    for (const s of snapshots) if (s.postId && (!lastByPost.get(s.postId) || s.capturedAt > (lastByPost.get(s.postId)?.capturedAt ?? ""))) lastByPost.set(s.postId, s);
    const reviewed = new Set((await store.listReviews(org, { limit: 500 })).map((r) => r.postId));
    const touchedAccounts = new Set<ID>();

    for (const job of orgJobs) {
      if (budget <= 0 || !job.providerPostId || !job.publishedAt) continue;
      const hours = (now.getTime() - new Date(job.publishedAt).getTime()) / 3_600_000;
      const last = lastByPost.get(job.postId) ?? null;
      const due = options.force ? Math.max(0, hours) : dueCheckpoint(hours, last?.hoursSincePublish ?? null);
      if (due !== null) {
        budget--;
        const credential = await store.getCredential(org, job.socialAccountId);
        if (!credential) continue;
        try {
          const provider = getSocialProvider(job.provider, { isDemoOrganization: meta.isDemo });
          const result = await provider.getPostInsights({ accessToken: credential.token.accessToken, providerPostId: job.providerPostId, format: job.format });
          const snapshot = await store.addSnapshot({
            organizationId: org,
            locationId: job.locationId,
            socialAccountId: job.socialAccountId,
            postId: job.postId,
            provider: job.provider,
            scope: "post",
            providerPostId: job.providerPostId,
            capturedAt: now.toISOString(),
            hoursSincePublish: Math.round(hours * 100) / 100,
            metrics: result.metrics,
          });
          lastByPost.set(job.postId, snapshot);
          touchedAccounts.add(job.socialAccountId);
          summary.postSnapshots++;
        } catch (error) {
          summary.errors++;
          await handleSyncError(store, org, job.socialAccountId, error, job.postId);
          continue;
        }
      }
      const latest = lastByPost.get(job.postId);
      if (options.repo && reviewBudget > 0 && latest && (latest.hoursSincePublish ?? 0) >= AUTO_REVIEW_AFTER_HOURS && !reviewed.has(job.postId)) {
        try {
          await reviewPostPerformance({ store, repo: options.repo }, org, job.postId, null);
          reviewed.add(job.postId);
          reviewBudget--;
          summary.reviews++;
        } catch (error) {
          summary.errors++;
          console.error("[social] auto review failed", error instanceof Error ? error.message : error);
        }
      }
    }

    // Account-level snapshots (follower growth, account reach) once per ~day.
    const accountIds = new Set(orgJobs.map((j) => j.socialAccountId));
    for (const accountId of accountIds) {
      const recent = await store.listSnapshots(org, { accountId, scope: "account", since: new Date(now.getTime() - ACCOUNT_SYNC_HOURS * 3_600_000).toISOString() });
      if (recent.length && !options.force) continue;
      const [credential, account] = await Promise.all([store.getCredential(org, accountId), store.getAccountSummary(org, accountId)]);
      if (!credential || !account || (account.platform !== "instagram" && account.platform !== "threads")) continue;
      try {
        const provider = getSocialProvider(account.platform, { isDemoOrganization: meta.isDemo });
        const result = await provider.getAccountInsights({ accessToken: credential.token.accessToken, externalAccountId: credential.externalAccountId, since: new Date(now.getTime() - 86_400_000), until: now });
        await store.addSnapshot({
          organizationId: org,
          locationId: account.locationId,
          socialAccountId: accountId,
          postId: null,
          provider: account.platform,
          scope: "account",
          providerPostId: null,
          capturedAt: now.toISOString(),
          hoursSincePublish: null,
          metrics: result.metrics,
        });
        touchedAccounts.add(accountId);
        summary.accountSnapshots++;
      } catch (error) {
        summary.errors++;
        await handleSyncError(store, org, accountId, error, null);
      }
    }
    for (const accountId of touchedAccounts) await store.updateConnection(org, accountId, { lastSyncedAt: now.toISOString() });
    if (touchedAccounts.size) {
      await store.logEvent(org, { type: "insights_synced", message: `Insightsを同期しました（${touchedAccounts.size}アカウント）`, details: { postSnapshots: summary.postSnapshots } });
    }
  }
  return summary;
}

async function handleSyncError(store: SocialStore, org: ID, accountId: ID, error: unknown, postId: ID | null): Promise<void> {
  const e = error instanceof SocialApiError ? error : new SocialApiError("unknown", error instanceof Error ? error.message : "unknown");
  if (e.kind === "token_expired" || e.kind === "permission") {
    await store.updateConnection(org, accountId, { status: "reauthorization_required", error: e.userMessage });
  }
  await store.logEvent(org, { type: "insights_failed", level: "warn", message: `Insightsの取得に失敗しました：${e.userMessage}`, socialAccountId: accountId, postId, details: { code: e.options.code ?? e.kind } });
}
