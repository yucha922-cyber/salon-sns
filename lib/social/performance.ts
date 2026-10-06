import "server-only";
import { getAIProvider } from "@/lib/ai";
import { buildPerformanceReviewRequest, recommendationCategoryFor } from "@/lib/ai/prompts/performance-review";
import type { DataRepository } from "@/lib/data/repository";
import type { ID } from "@/lib/domain/types";
import { CHECKPOINTS, accountBaseline, latestByPost, snapshotAtCheckpoint } from "./metrics";
import { SocialStoreError, type SocialStore } from "./store";
import type { PerformanceReview } from "./types";

/**
 * Analyze → Learn: AI Performance Review of one published post.
 *   review   → post_performance_reviews (shown on the post / performance page)
 *   learning → content_learnings = Marketing Memory (read by Monthly Planner,
 *              Post Creator, Creative Studio, Chat)
 *   proposal → ai_recommendations (pending; a human approves before anything changes)
 */
export async function reviewPostPerformance(
  deps: { store: SocialStore; repo: DataRepository },
  organizationId: ID,
  postId: ID,
  actorUserId: ID | null,
): Promise<PerformanceReview> {
  const { store, repo } = deps;
  const [posts, accounts, locations, brain, meta] = await Promise.all([
    repo.listPosts(organizationId),
    repo.listAccounts(organizationId),
    repo.listLocationProfiles(organizationId),
    repo.getBrandBrain(organizationId),
    store.getOrganizationMeta(organizationId),
  ]);
  const post = posts.find((p) => p.id === postId);
  if (!post || post.status !== "published" || !post.accountId) throw new SocialStoreError("公開済みの投稿のみ分析できます", "conflict");
  const account = accounts.find((a) => a.id === post.accountId);
  if (!account || !brain) throw new SocialStoreError("account or brand not found", "not_found");

  const snapshots = await store.listSnapshots(organizationId, { accountId: account.id, scope: "post" });
  const latest = latestByPost(snapshots);
  const current = latest.get(postId);
  if (!current) throw new SocialStoreError("まだInsightsが取得されていません。投稿後しばらく待ってから再度お試しください。", "conflict");
  const memory = (await store.listLearnings(organizationId, { status: "active" })).filter((l) => l.socialAccountId === account.id || l.locationId === account.locationId);
  const locationName = locations.find((l) => l.locationId === account.locationId)?.locationName ?? "本部";
  const ai = getAIProvider();
  const { object } = await ai.generateStructuredObject(
    buildPerformanceReviewRequest({
      brain,
      post,
      account,
      locationName,
      timezone: meta?.timezone ?? "Asia/Tokyo",
      publishedAt: post.publishing.publishedAt ?? current.capturedAt,
      current,
      checkpoints: CHECKPOINTS.map((cp) => ({ label: cp.label, snapshot: snapshotAtCheckpoint(snapshots, postId, cp.hours) })),
      baseline: accountBaseline([...latest.values()], postId),
      memory,
    }),
  );

  const review = await store.addReview({
    organizationId,
    locationId: post.locationId,
    socialAccountId: account.id,
    postId,
    snapshotId: current.id,
    summary: object.summary,
    whatWorked: object.whatWorked,
    whatDidNotWork: object.whatDidNotWork,
    possibleReasons: object.possibleReasons,
    keyLearning: object.keyLearning,
    recommendedNextAction: object.recommendedNextAction,
    nextCreativeHypothesis: object.nextCreativeHypothesis,
    confidence: object.confidence,
    aiProvider: ai.name,
  });
  const base = { postId, socialAccountId: account.id, locationId: post.locationId, actorUserId };
  await store.logEvent(organizationId, { ...base, type: "review_generated", message: `「${post.title}」のAI Performance Reviewを作成しました`, details: { confidence: object.confidence } });

  if (object.learning) {
    await store.addLearning(
      organizationId,
      {
        locationId: post.locationId,
        socialAccountId: account.id,
        platform: account.platform,
        goal: account.goal,
        contentPillar: object.learning.contentPillar || post.planning.contentPillar,
        hypothesis: object.learning.hypothesis,
        result: object.learning.result,
        learning: object.learning.learning,
        confidence: object.confidence,
        validFrom: new Date().toISOString().slice(0, 10),
        validUntil: null,
        sourcePostIds: [postId],
        sourceReviewId: review.id,
      },
      actorUserId,
    );
    await store.logEvent(organizationId, { ...base, type: "learning_saved", message: `Marketing Memoryに学びを追加：${object.learning.learning.slice(0, 60)}` });
  }
  if (object.recommendation) {
    const pending = (await repo.listRecommendations(organizationId)).filter((r) => r.status === "pending").map((r) => r.title);
    if (!pending.includes(object.recommendation.title)) {
      await repo.createRecommendations(organizationId, [
        {
          ...object.recommendation,
          category: recommendationCategoryFor(account.goal),
          locationId: post.locationId,
          socialAccountId: account.id,
          source: "performance",
          sourcePostIds: [postId],
        },
      ]);
      await store.logEvent(organizationId, { ...base, type: "recommendation_generated", message: `AI Recommendationを作成：${object.recommendation.title}` });
    }
  }
  return review;
}
