import "server-only";
import { createHash } from "node:crypto";
import { mockPerformanceReview } from "@/lib/ai/prompts/performance-review";
import type { DataRepository } from "@/lib/data/repository";
import type { ID, Post } from "@/lib/domain/types";
import { CHECKPOINTS, accountBaseline, latestByPost, snapshotAtCheckpoint } from "@/lib/social/metrics";
import { mockAccountMetrics, mockPostMetrics, mockProviderPostId } from "@/lib/social/mock";
import { POST_CHECKPOINT_HOURS } from "@/lib/social/insights-sync";
import type { SocialStore } from "@/lib/social/store";
import { composePostText } from "@/lib/social/text";
import type { MetricSnapshot, PublishFormat, PublishablePlatform } from "@/lib/social/types";
import { recommendationCategoryFor } from "@/lib/ai/prompts/performance-review";

/**
 * Seeds the publishing loop for the NAORU Demo HQ with the MockSocialProvider:
 *   - accounts connected (one "Token Expiring", one "Reconnect Required")
 *   - every published post went through a real publish_job
 *   - insights snapshots at 1h / 24h / 3d / 7d / … (time series)
 *   - daily account snapshots (follower growth)
 *   - AI performance reviews + Marketing Memory for the strongest/weakest posts
 * Nothing here talks to Meta.
 */
const hashNum = (s: string) => parseInt(createHash("sha1").update(s).digest("hex").slice(0, 8), 16);

export function demoFormat(post: Pick<Post, "platform" | "contentType">): PublishFormat {
  if (post.platform === "threads") return "THREADS_TEXT";
  if (post.contentType === "reel") return "IG_REEL";
  if (post.contentType === "carousel") return "IG_CAROUSEL";
  return "IG_IMAGE";
}

export async function seedDemoSocial(store: SocialStore, repo: DataRepository, organizationId: ID, now: Date = new Date()): Promise<void> {
  const [accounts, posts, brain, locations] = await Promise.all([
    repo.listAccounts(organizationId),
    repo.listPosts(organizationId),
    repo.getBrandBrain(organizationId),
    repo.listLocationProfiles(organizationId),
  ]);
  const external = new Map<ID, string>();

  for (const account of accounts) {
    if (account.platform !== "instagram" && account.platform !== "threads") continue;
    const username = account.handle.replace(/^@/, "");
    const externalAccountId = `mock_${account.platform}_${hashNum(username)}`;
    external.set(account.id, externalAccountId);
    const reconnect = account.handle === "@naoru_yokohama_threads";
    const expiring = account.handle === "@naoru_ikebukuro_threads";
    const expiresAt = new Date(now.getTime() + (reconnect ? -2 : expiring ? 4 : 52) * 86_400_000).toISOString();
    await store.saveCredential(organizationId, account.id, account.platform, externalAccountId, {
      accessToken: `mock_demo_${username}`,
      expiresAt,
      scopes: account.platform === "instagram" ? ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"] : ["threads_basic", "threads_content_publish", "threads_manage_insights"],
    });
    await store.updateConnection(organizationId, account.id, {
      status: reconnect ? "reauthorization_required" : "connected",
      externalAccountId,
      username,
      profileImageUrl: null,
      tokenExpiresAt: expiresAt,
      scopes: account.platform === "instagram" ? ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"] : ["threads_basic", "threads_content_publish", "threads_manage_insights"],
      connectedAt: new Date(now.getTime() - 60 * 86_400_000).toISOString(),
      lastSyncedAt: now.toISOString(),
      error: reconnect ? "トークンの有効期限が切れました。再接続してください。" : null,
      metadata: account.platform === "instagram" ? { account_type: "BUSINESS", followers_count: 900 + (hashNum(username) % 2400) } : {},
    });
    await store.logEvent(organizationId, { type: "account_connected", message: `${account.handle} を接続しました（デモ）`, socialAccountId: account.id, locationId: account.locationId });
    if (reconnect) {
      await store.logEvent(organizationId, { type: "account_reauthorization_required", level: "error", message: `${account.handle} の認証が切れています。再接続が必要です。`, socialAccountId: account.id, locationId: account.locationId });
    }
  }

  // Published posts → publish jobs + insights time series.
  const published = posts.filter((p) => p.status === "published" && p.accountId && p.scheduledAt && external.has(p.accountId));
  for (const post of published) {
    const publishedAt = post.scheduledAt as string;
    const platform = post.platform as PublishablePlatform;
    const format = demoFormat(post);
    const text = composePostText(post, { maxHashtags: platform === "threads" ? 1 : undefined });
    const providerPostId = mockProviderPostId(platform, new Date(publishedAt), text);
    const job = await store.createJob({
      organizationId,
      locationId: post.locationId,
      socialAccountId: post.accountId as ID,
      postId: post.id,
      provider: platform,
      format,
      mode: "scheduled",
      scheduledAt: publishedAt,
      maxAttempts: 3,
      content: { text, mediaIds: [], contentType: post.contentType, format, title: post.title },
      requestedBy: null,
    });
    const permalink = platform === "instagram" ? `https://www.instagram.com/p/${providerPostId.slice(-10)}/` : `https://www.threads.com/@demo/post/${providerPostId.slice(-10)}`;
    await store.updateJob(organizationId, job.id, { status: "published", attemptCount: 1, providerPostId, providerPermalink: permalink, publishedAt });
    await store.updatePostPublishing(organizationId, post.id, { status: "published", publishedAt, providerPostId, permalink, approvedAt: publishedAt, error: null });
    const ageHours = (now.getTime() - new Date(publishedAt).getTime()) / 3_600_000;
    for (const h of POST_CHECKPOINT_HOURS.filter((x) => x <= ageHours)) {
      const capturedAt = new Date(new Date(publishedAt).getTime() + h * 3_600_000);
      await store.addSnapshot({
        organizationId,
        locationId: post.locationId,
        socialAccountId: post.accountId as ID,
        postId: post.id,
        provider: platform,
        scope: "post",
        providerPostId,
        capturedAt: capturedAt.toISOString(),
        hoursSincePublish: h,
        metrics: mockPostMetrics(providerPostId, format, capturedAt).metrics,
      });
    }
  }

  // Daily account snapshots (14 days) for follower growth.
  for (const account of accounts) {
    const ext = external.get(account.id);
    if (!ext || account.handle === "@naoru_yokohama_threads") continue;
    for (let d = 14; d >= 0; d--) {
      const at = new Date(now.getTime() - d * 86_400_000);
      await store.addSnapshot({
        organizationId,
        locationId: account.locationId,
        socialAccountId: account.id,
        postId: null,
        provider: account.platform as PublishablePlatform,
        scope: "account",
        providerPostId: null,
        capturedAt: at.toISOString(),
        hoursSincePublish: null,
        metrics: mockAccountMetrics(account.platform as PublishablePlatform, ext, at),
      });
    }
  }

  // AI performance reviews + Marketing Memory (deterministic mock review, no AI call at seed time).
  if (!brain) return;
  const reviewed = new Set<ID>();
  for (const account of accounts.filter((a) => a.platform === "instagram" && external.has(a.id))) {
    const snapshots = await store.listSnapshots(organizationId, { accountId: account.id, scope: "post" });
    const latest = latestByPost(snapshots);
    const candidates = [...latest.values()].filter((s) => (s.hoursSincePublish ?? 0) >= 72 && s.postId);
    if (candidates.length < 3) continue;
    const rate = (s: MetricSnapshot) => (s.metrics.saves ?? 0) / (s.metrics.reach || 1);
    const sorted = candidates.sort((a, b) => rate(b) - rate(a));
    for (const snap of [sorted[0], sorted[sorted.length - 1]]) {
      const post = snap && posts.find((p) => p.id === snap.postId);
      if (!snap || !post || reviewed.has(post.id)) continue;
      reviewed.add(post.id);
      const out = mockPerformanceReview({
        brain,
        post,
        account,
        locationName: locations.find((l) => l.locationId === account.locationId)?.locationName ?? "本部",
        timezone: "Asia/Tokyo",
        publishedAt: post.scheduledAt ?? snap.capturedAt,
        current: snap,
        checkpoints: CHECKPOINTS.map((cp) => ({ label: cp.label, snapshot: snapshotAtCheckpoint(snapshots, post.id, cp.hours) })),
        baseline: accountBaseline([...latest.values()], post.id),
        memory: [],
      });
      const review = await store.addReview({
        organizationId,
        locationId: post.locationId,
        socialAccountId: account.id,
        postId: post.id,
        snapshotId: snap.id,
        summary: out.summary,
        whatWorked: out.whatWorked,
        whatDidNotWork: out.whatDidNotWork,
        possibleReasons: out.possibleReasons,
        keyLearning: out.keyLearning,
        recommendedNextAction: out.recommendedNextAction,
        nextCreativeHypothesis: out.nextCreativeHypothesis,
        confidence: out.confidence,
        aiProvider: "mock",
      });
      if (out.learning) {
        await store.addLearning(
          organizationId,
          {
            locationId: post.locationId,
            socialAccountId: account.id,
            platform: account.platform,
            goal: account.goal,
            contentPillar: out.learning.contentPillar || post.planning.contentPillar,
            hypothesis: out.learning.hypothesis,
            result: out.learning.result,
            learning: out.learning.learning,
            confidence: out.confidence,
            validFrom: now.toISOString().slice(0, 10),
            validUntil: null,
            sourcePostIds: [post.id],
            sourceReviewId: review.id,
          },
          null,
        );
      }
      if (out.recommendation) {
        await repo.createRecommendations(organizationId, [
          { ...out.recommendation, category: recommendationCategoryFor(account.goal), locationId: post.locationId, socialAccountId: account.id, source: "performance", sourcePostIds: [post.id] },
        ]);
      }
    }
  }
}
