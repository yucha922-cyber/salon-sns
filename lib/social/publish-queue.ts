import "server-only";
import type { AppContext } from "@/lib/auth/context";
import type { ID, Post, SnsAccount } from "@/lib/domain/types";
import { assertCanEdit, canAccessLocation, getSocialContext, type SocialContext } from "./access";
import { SocialApiError } from "./errors";
import { toPublishMedia } from "./media";
import { evaluateReadiness, type PublishReadiness } from "./readiness";
import { getSocialProvider } from "./registry";
import { INSTAGRAM_LIMITS } from "./instagram/rules";
import { THREADS_LIMITS } from "./threads/rules";
import { SocialStoreError, type SocialStore } from "./store";
import type { ContentSnapshot, MediaAsset, PublishJob, PublishablePlatform } from "./types";
import { isPublishablePlatform } from "./types";

/**
 * Publish Queue.
 *   Approve (human) → schedulePost / publishNow → publish_jobs (queued)
 *   → worker claims due jobs → provider.publishPost → published | retrying | failed
 * Rules:
 *   - Only approved posts that pass validation and target a connected account
 *     can be queued. The approved text/media are snapshotted on the job.
 *   - Retries: max 3 attempts, backoff 5 → 15 → 60 min (or the provider's
 *     Retry-After). Token / permission / invalid-content errors never retry.
 *   - Video containers that are still processing do not consume attempts;
 *     the worker resumes them on the next tick (container id persisted first
 *     to avoid double posting).
 */
export const MAX_ATTEMPTS = 3;
export const RETRY_DELAYS_MINUTES = [5, 15, 60];
const LOCK_SECONDS = 120;
const PROCESSING_POLL_SECONDS = 60;
const PROCESSING_TIMEOUT_MS = 2 * 3_600_000;

export interface PostPublishState {
  post: Post;
  account: SnsAccount | null;
  media: MediaAsset[];
  jobs: PublishJob[];
  readiness: PublishReadiness;
  timezone: string;
}

async function loadPost(app: AppContext, ctx: SocialContext, postId: ID) {
  const post = (await app.repo.listPosts(ctx.organizationId)).find((p) => p.id === postId);
  if (!post) throw new SocialStoreError("post not found", "not_found");
  if (!canAccessLocation(ctx, post.locationId)) throw new SocialStoreError("この店舗の投稿を操作する権限がありません", "forbidden");
  const account = post.accountId ? ((await app.repo.listAccounts(ctx.organizationId)).find((a) => a.id === post.accountId) ?? null) : null;
  return { post, account };
}

export async function getPostPublishState(app: AppContext, postId: ID): Promise<PostPublishState> {
  const ctx = await getSocialContext(app);
  const { post, account } = await loadPost(app, ctx, postId);
  const [media, jobs] = await Promise.all([ctx.reader.listMedia(ctx.organizationId, postId), ctx.reader.listJobs(ctx.organizationId, { postId, limit: 10 })]);
  const activeJob = jobs.find((j) => j.status === "queued" || j.status === "retrying" || j.status === "publishing") ?? null;
  return { post, account, media, jobs, readiness: evaluateReadiness({ post, account, media, activeJob }), timezone: ctx.timezone };
}

export async function approvePost(app: AppContext, postId: ID): Promise<void> {
  const ctx = await getSocialContext(app);
  const state = await getPostPublishState(app, postId);
  const writer = assertCanEdit(ctx, state.post.locationId);
  if (!state.readiness.canApprove) {
    const first = state.readiness.validation?.issues.find((i) => i.severity === "error") ?? state.readiness.blockers[0];
    throw new SocialStoreError(first ? `${first.message} ${first.fix}` : "この投稿は承認できない状態です", "conflict");
  }
  await writer.updatePostPublishing(ctx.organizationId, postId, { status: "approved", approvedAt: new Date().toISOString(), approvedBy: ctx.userId, error: null });
  await writer.logEvent(ctx.organizationId, {
    type: "post_approved",
    message: `「${state.post.title}」の投稿内容を承認しました`,
    postId,
    socialAccountId: state.post.accountId,
    locationId: state.post.locationId,
    actorUserId: ctx.userId,
  });
}

/** Withdraws approval (e.g. content edited after approval). */
export async function revokeApproval(app: AppContext, postId: ID): Promise<void> {
  const ctx = await getSocialContext(app);
  const { post } = await loadPost(app, ctx, postId);
  if (post.status !== "approved") return;
  const writer = assertCanEdit(ctx, post.locationId);
  await writer.updatePostPublishing(ctx.organizationId, postId, { status: post.scheduledAt ? "scheduled" : "draft", approvedAt: null, approvedBy: null });
}

async function enqueue(app: AppContext, postId: ID, mode: PublishJob["mode"]): Promise<{ ctx: SocialContext; writer: SocialStore; job: PublishJob }> {
  const ctx = await getSocialContext(app);
  const state = await getPostPublishState(app, postId);
  const writer = assertCanEdit(ctx, state.post.locationId);
  const r = state.readiness;
  if (mode === "scheduled" ? !r.canSchedule : !r.canPublishNow) {
    const first = r.blockers[0] ?? r.validation?.issues.find((i) => i.severity === "error");
    const reason = first
      ? `${first.message} ${first.fix}`
      : state.post.status !== "approved"
        ? "先に投稿内容を承認してください。"
        : r.activeJob
          ? "この投稿はすでに予約されています。"
          : "予約日時を現在より1分以上先に設定してください。";
    throw new SocialStoreError(reason, "conflict");
  }
  const validation = r.validation;
  if (!validation?.format || !state.account || !isPublishablePlatform(state.post.platform)) throw new SocialStoreError("validation failed", "conflict");
  const content: ContentSnapshot = {
    text: validation.text,
    mediaIds: state.media.map((m) => m.id),
    contentType: state.post.contentType,
    format: validation.format,
    title: state.post.title,
  };
  const scheduledAt = mode === "immediate" ? new Date().toISOString() : (state.post.scheduledAt as string);
  const job = await writer.createJob({
    organizationId: ctx.organizationId,
    locationId: state.post.locationId,
    socialAccountId: state.account.id,
    postId,
    provider: state.post.platform,
    format: validation.format,
    mode,
    scheduledAt,
    maxAttempts: MAX_ATTEMPTS,
    content,
    requestedBy: ctx.userId,
  });
  await writer.updatePostPublishing(ctx.organizationId, postId, { status: "queued", error: null });
  await writer.logEvent(ctx.organizationId, {
    type: "publish_queued",
    message: mode === "immediate" ? `「${state.post.title}」を今すぐ投稿します（${state.account.handle}）` : `「${state.post.title}」を予約しました（${state.account.handle}）`,
    postId,
    publishJobId: job.id,
    socialAccountId: state.account.id,
    locationId: state.post.locationId,
    actorUserId: ctx.userId,
    details: { mode, scheduledAt, format: validation.format },
  });
  return { ctx, writer, job };
}

/** Registers an approved post in the Publish Queue for its scheduled time. */
export async function schedulePost(app: AppContext, postId: ID): Promise<PublishJob> {
  return (await enqueue(app, postId, "scheduled")).job;
}

/** "今すぐ投稿": queues and processes the job right away (still through the queue). */
export async function publishNow(app: AppContext, postId: ID): Promise<PublishJob> {
  const { ctx, writer, job } = await enqueue(app, postId, "immediate");
  // Claim exactly this job (conditional update = no double processing with the cron worker).
  const claimed = await writer.updateJob(ctx.organizationId, job.id, { status: "publishing", lockedUntil: new Date(Date.now() + LOCK_SECONDS * 1000).toISOString() }, { statuses: ["queued"] });
  if (claimed) await processJob(writer, claimed);
  return (await writer.getJob(ctx.organizationId, job.id)) ?? job;
}

export async function cancelJob(app: AppContext, jobId: ID): Promise<void> {
  const ctx = await getSocialContext(app);
  const job = await ctx.reader.getJob(ctx.organizationId, jobId);
  if (!job) throw new SocialStoreError("job not found", "not_found");
  const writer = assertCanEdit(ctx, job.locationId);
  const updated = await writer.updateJob(ctx.organizationId, jobId, { status: "cancelled", lockedUntil: null }, { statuses: ["queued", "retrying"] });
  if (!updated) throw new SocialStoreError("投稿処理中のため取り消せません。完了後に確認してください。", "conflict");
  await writer.updatePostPublishing(ctx.organizationId, job.postId, { status: "approved", error: null });
  await writer.logEvent(ctx.organizationId, { type: "publish_cancelled", message: `「${job.content.title}」の予約を取り消しました`, postId: job.postId, publishJobId: jobId, socialAccountId: job.socialAccountId, locationId: job.locationId, actorUserId: ctx.userId });
}

/** Failed post → back to approved so it can be re-queued after fixing the cause. */
export async function resetFailedPost(app: AppContext, postId: ID): Promise<void> {
  const ctx = await getSocialContext(app);
  const { post } = await loadPost(app, ctx, postId);
  if (post.status !== "failed") return;
  const writer = assertCanEdit(ctx, post.locationId);
  await writer.updatePostPublishing(ctx.organizationId, postId, { status: "approved" });
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export interface ProcessSummary {
  claimed: number;
  published: number;
  processing: number;
  retrying: number;
  failed: number;
}

export async function processDueJobs(store: SocialStore, options: { now?: Date; organizationId?: ID; limit?: number; timeBudgetMs?: number } = {}): Promise<ProcessSummary> {
  const started = Date.now();
  const summary: ProcessSummary = { claimed: 0, published: 0, processing: 0, retrying: 0, failed: 0 };
  const jobs = await store.systemClaimDueJobs(options.now ?? new Date(), options.limit ?? 10, LOCK_SECONDS, options.organizationId);
  summary.claimed = jobs.length;
  for (const job of jobs) {
    if (Date.now() - started > (options.timeBudgetMs ?? 45_000)) {
      // Release unprocessed claims so the next tick picks them up immediately.
      await store.updateJob(job.organizationId, job.id, { status: job.attemptCount > 0 ? "retrying" : "queued", lockedUntil: null });
      continue;
    }
    const result = await processJob(store, job, options.now);
    summary[result]++;
  }
  return summary;
}

const minutes = (n: number) => n * 60_000;

export async function processJob(store: SocialStore, job: PublishJob, nowArg?: Date): Promise<"published" | "processing" | "retrying" | "failed"> {
  const now = nowArg ?? new Date();
  const org = job.organizationId;
  const resuming = job.providerContainerId !== null;
  const attempt = resuming ? Math.max(1, job.attemptCount) : job.attemptCount + 1;
  const base = { postId: job.postId, publishJobId: job.id, socialAccountId: job.socialAccountId, locationId: job.locationId };

  const fail = async (message: string, code: string | null, userMessage: string) => {
    await store.updateJob(org, job.id, { status: "failed", attemptCount: attempt, lockedUntil: null, lastError: message, lastErrorCode: code });
    await store.updatePostPublishing(org, job.postId, { status: "failed", error: userMessage });
    await store.logEvent(org, { ...base, type: "publish_failed", level: "error", message: `投稿に失敗しました：${userMessage}`, details: { code, attempt } });
    return "failed" as const;
  };

  try {
    const [account, meta, credential] = await Promise.all([store.getAccountSummary(org, job.socialAccountId), store.getOrganizationMeta(org), store.getCredential(org, job.socialAccountId)]);
    if (!account || !meta) return await fail("account or organization missing", "missing", "投稿先アカウントが見つかりません。");
    if (!credential || (account.status !== "connected" && account.status !== "error")) {
      return await fail("account not connected", "not_connected", `${account.handle} が接続されていません。再接続してから再度予約してください。`);
    }
    if (credential.token.expiresAt && new Date(credential.token.expiresAt) <= now) {
      await store.updateConnection(org, job.socialAccountId, { status: "reauthorization_required", error: "トークンの有効期限が切れました" });
      return await fail("token expired", "token_expired", "SNSアカウントの認証が切れています。再接続してください。");
    }
    if (!resuming) {
      const limit = job.provider === "instagram" ? INSTAGRAM_LIMITS.dailyPublishLimit : THREADS_LIMITS.dailyPublishLimit;
      const used = await store.countPublishedSince(org, job.socialAccountId, new Date(now.getTime() - 86_400_000).toISOString());
      if (used >= limit) throw new SocialApiError("rate_limited", `daily publish limit reached (${used}/${limit})`, { retryAfterSeconds: 3600 });
      await store.logEvent(org, { ...base, type: "publish_started", message: `${account.handle} への投稿を開始しました（${attempt}回目）`, details: { attempt, format: job.format } });
    } else if (now.getTime() - new Date(job.scheduledAt).getTime() > PROCESSING_TIMEOUT_MS) {
      return await fail("media processing timeout", "processing_timeout", "SNS側の動画処理が2時間以内に完了しませんでした。動画の形式・サイズを確認して再度予約してください。");
    }

    const media: MediaAsset[] = [];
    for (const id of job.content.mediaIds) {
      const asset = await store.getMedia(org, id);
      if (!asset || asset.status !== "ready") return await fail(`media ${id} missing`, "media_missing", "投稿する画像・動画が見つかりません。メディアを確認して再度予約してください。");
      media.push(asset);
    }
    const provider = getSocialProvider(job.provider as PublishablePlatform, { isDemoOrganization: meta.isDemo });
    const outcome = await provider.publishPost({
      externalAccountId: credential.externalAccountId,
      accessToken: credential.token.accessToken,
      format: job.format,
      text: job.content.text,
      media: await toPublishMedia(media),
      containerId: job.providerContainerId,
      onContainerCreated: async (containerId) => {
        await store.updateJob(org, job.id, { providerContainerId: containerId, attemptCount: attempt });
      },
    });

    if (outcome.state === "processing") {
      await store.updateJob(org, job.id, {
        status: "publishing",
        attemptCount: attempt,
        providerContainerId: outcome.containerId,
        nextAttemptAt: new Date(now.getTime() + PROCESSING_POLL_SECONDS * 1000).toISOString(),
        lockedUntil: null,
        providerResponse: outcome.response,
      });
      await store.updatePostPublishing(org, job.postId, { status: "publishing" });
      return "processing";
    }

    const publishedAt = now.toISOString();
    await store.updateJob(org, job.id, {
      status: "published",
      attemptCount: attempt,
      lockedUntil: null,
      providerPostId: outcome.providerPostId,
      providerPermalink: outcome.permalink,
      publishedAt,
      lastError: null,
      lastErrorCode: null,
      providerResponse: outcome.response,
    });
    await store.updatePostPublishing(org, job.postId, { status: "published", publishedAt, providerPostId: outcome.providerPostId, permalink: outcome.permalink, error: null });
    await store.logEvent(org, { ...base, type: "publish_success", message: `${account.handle} に投稿しました`, details: { providerPostId: outcome.providerPostId, attempt } });
    return "published";
  } catch (error) {
    const e = error instanceof SocialApiError ? error : new SocialApiError("unknown", error instanceof Error ? error.message : "unknown error");
    if (e.kind === "token_expired" || e.kind === "permission") {
      await store.updateConnection(org, job.socialAccountId, { status: "reauthorization_required", error: e.userMessage });
      await store.logEvent(org, { ...base, type: "account_reauthorization_required", level: "error", message: e.userMessage });
      return fail(e.message, e.options.code ?? e.kind, e.userMessage);
    }
    if (e.retryable && attempt < job.maxAttempts) {
      const delay = e.options.retryAfterSeconds ? Math.max(minutes(1), e.options.retryAfterSeconds * 1000) : minutes(RETRY_DELAYS_MINUTES[attempt - 1] ?? 60);
      const next = new Date(now.getTime() + delay).toISOString();
      await store.updateJob(org, job.id, {
        status: "retrying",
        attemptCount: attempt,
        lockedUntil: null,
        nextAttemptAt: next,
        // A failed creation leaves no reusable container.
        providerContainerId: null,
        lastError: e.message,
        lastErrorCode: e.options.code ?? e.kind,
      });
      await store.updatePostPublishing(org, job.postId, { status: "queued", error: `${e.userMessage}（${attempt}/${job.maxAttempts}回目・自動で再試行します）` });
      await store.logEvent(org, { ...base, type: "publish_retry_scheduled", level: "warn", message: `投稿に失敗したため再試行します（${attempt}/${job.maxAttempts}）：${e.userMessage}`, details: { code: e.options.code ?? e.kind, nextAttemptAt: next } });
      return "retrying";
    }
    return fail(e.message, e.options.code ?? e.kind, e.userMessage);
  }
}
