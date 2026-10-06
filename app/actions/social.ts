"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppContext } from "@/lib/auth/context";
import { validationError, type ActionResult } from "@/lib/actions";
import { ACCOUNT_GOALS, type ID } from "@/lib/domain/types";
import { toUserMessage } from "@/lib/services/errors";
import { assertCanEdit, canAccessLocation, getSocialContext } from "@/lib/social/access";
import { connectionBadge } from "@/lib/social/connection";
import { completeConnection, disconnectAccount } from "@/lib/social/connections";
import { SocialApiError } from "@/lib/social/errors";
import { syncInsights } from "@/lib/social/insights-sync";
import { ACCEPTED_MIME, createUploadTarget, deleteStoredObject, DEMO_MEDIA_MAX_BYTES, signedReadUrl, storagePathFor, UPLOAD_MAX_BYTES, verifyUploadedObject, type UploadTarget } from "@/lib/social/media";
import { CHECKPOINTS, snapshotAtCheckpoint } from "@/lib/social/metrics";
import { reviewPostPerformance } from "@/lib/social/performance";
import { approvePost, cancelJob, getPostPublishState, processDueJobs, publishNow, resetFailedPost, schedulePost } from "@/lib/social/publish-queue";
import { SocialStoreError } from "@/lib/social/store";
import { checkRateLimit, RATE_LIMITS, rateLimitMessage } from "@/lib/social/rate-limit";
import type { ConnectionBadge, MediaAsset, NormalizedMetrics, PerformanceReview, PublishJob, ValidationIssue } from "@/lib/social/types";
import { getDataMode } from "@/lib/env";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "IDが不正です");

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof SocialStoreError) {
    if (error.code === "forbidden" || error.code === "conflict" || error.code === "unavailable" || error.code === "not_found") return error.message;
  }
  if (error instanceof SocialApiError) return error.userMessage;
  return toUserMessage(error, fallback);
}

function refresh() {
  revalidatePath("/planner");
  revalidatePath("/posts");
  revalidatePath("/publishing");
  revalidatePath("/dashboard");
  revalidatePath("/performance");
  revalidatePath("/accounts");
}

// ---------------------------------------------------------------------------
// Publish panel (post modal)
// ---------------------------------------------------------------------------

export interface PublishPanelState {
  postStatus: string;
  timezone: string;
  account: { id: ID; handle: string; platform: string; locationName: string; badge: ConnectionBadge; mock: boolean } | null;
  accountOptions: { id: ID; label: string }[];
  media: (Pick<MediaAsset, "id" | "kind" | "mimeType" | "sizeBytes" | "width" | "height" | "durationMs" | "status"> & { previewUrl: string | null })[];
  validationIssues: ValidationIssue[];
  blockers: ValidationIssue[];
  format: string | null;
  finalText: string;
  canApprove: boolean;
  canSchedule: boolean;
  canPublishNow: boolean;
  activeJob: Pick<PublishJob, "id" | "status" | "scheduledAt" | "attemptCount" | "maxAttempts" | "lastError" | "nextAttemptAt" | "mode"> | null;
  lastJob: Pick<PublishJob, "id" | "status" | "lastError" | "publishedAt" | "providerPermalink" | "attemptCount"> | null;
  publishing: { publishedAt: string | null; permalink: string | null; error: string | null; approvedAt: string | null };
  checkpoints: { label: string; metrics: NormalizedMetrics | null }[];
  review: PerformanceReview | null;
  uploadLimitBytes: number;
}

export async function getPublishPanelAction(postIdInput: unknown): Promise<ActionResult<PublishPanelState>> {
  const parsed = id.safeParse(postIdInput);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const app = await requireAppContext();
    const ctx = await getSocialContext(app);
    const state = await getPostPublishState(app, parsed.data);
    const [accounts, locations, snapshots, reviews] = await Promise.all([
      app.repo.listAccounts(ctx.organizationId),
      app.repo.listLocationProfiles(ctx.organizationId),
      ctx.reader.listSnapshots(ctx.organizationId, { postIds: [parsed.data], scope: "post" }),
      ctx.reader.listReviews(ctx.organizationId, { postId: parsed.data, limit: 1 }),
    ]);
    const locName = (lid: ID | null) => locations.find((l) => l.locationId === lid)?.locationName ?? "本部";
    const a = state.account;
    const lastJob = state.jobs[0] ?? null;
    const media = await Promise.all(
      state.media.map(async (m) => ({
        id: m.id,
        kind: m.kind,
        mimeType: m.mimeType,
        sizeBytes: m.sizeBytes,
        width: m.width,
        height: m.height,
        durationMs: m.durationMs,
        status: m.status,
        previewUrl: m.status === "ready" ? await signedReadUrl(m, 600) : null,
      })),
    );
    return {
      ok: true,
      data: {
        postStatus: state.post.status,
        timezone: state.timezone,
        account: a
          ? { id: a.id, handle: a.handle, platform: a.platform, locationName: locName(a.locationId), badge: connectionBadge(a.connection), mock: app.current.organization.isDemo || getDataMode() === "demo" }
          : null,
        accountOptions: accounts
          .filter((x) => x.platform === state.post.platform && canAccessLocation(ctx, x.locationId))
          .map((x) => ({ id: x.id, label: `${locName(x.locationId)} / ${x.handle}` })),
        media,
        validationIssues: state.readiness.validation?.issues ?? [],
        blockers: state.readiness.blockers,
        format: state.readiness.validation?.format ?? null,
        finalText: state.readiness.validation?.text ?? "",
        canApprove: state.readiness.canApprove && app.current.role !== "viewer",
        canSchedule: state.readiness.canSchedule && app.current.role !== "viewer",
        canPublishNow: state.readiness.canPublishNow && app.current.role !== "viewer",
        activeJob: state.readiness.activeJob
          ? (({ id: jid, status, scheduledAt, attemptCount, maxAttempts, lastError, nextAttemptAt, mode }) => ({ id: jid, status, scheduledAt, attemptCount, maxAttempts, lastError, nextAttemptAt, mode }))(state.readiness.activeJob)
          : null,
        lastJob: lastJob ? { id: lastJob.id, status: lastJob.status, lastError: lastJob.lastError, publishedAt: lastJob.publishedAt, providerPermalink: lastJob.providerPermalink, attemptCount: lastJob.attemptCount } : null,
        publishing: { publishedAt: state.post.publishing.publishedAt, permalink: state.post.publishing.permalink, error: state.post.publishing.error, approvedAt: state.post.publishing.approvedAt },
        checkpoints: CHECKPOINTS.map((cp): { label: string; metrics: NormalizedMetrics | null } => ({ label: cp.label, metrics: snapshotAtCheckpoint(snapshots, parsed.data, cp.hours)?.metrics ?? null })).concat(
          snapshots.length ? [{ label: "最新", metrics: snapshots[snapshots.length - 1]?.metrics ?? null }] : [],
        ),
        review: reviews[0] ?? null,
        uploadLimitBytes: getDataMode() === "demo" ? DEMO_MEDIA_MAX_BYTES : UPLOAD_MAX_BYTES,
      },
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "公開情報の取得に失敗しました") };
  }
}

const postAction = (fn: (app: Awaited<ReturnType<typeof requireAppContext>>, postId: ID) => Promise<unknown>, fallback: string) =>
  async (input: unknown): Promise<ActionResult> => {
    const parsed = id.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    try {
      await fn(await requireAppContext(), parsed.data);
      refresh();
      return { ok: true, data: undefined };
    } catch (error) {
      return { ok: false, error: errorMessage(error, fallback) };
    }
  };

export async function approvePostAction(input: unknown) {
  return postAction(approvePost, "承認に失敗しました")(input);
}

export async function schedulePostAction(input: unknown) {
  return postAction(schedulePost, "予約に失敗しました")(input);
}

export async function resetFailedPostAction(input: unknown) {
  return postAction(resetFailedPost, "更新に失敗しました")(input);
}

/** 今すぐ投稿 (requires approval + validation; the UI shows a confirmation modal first). */
export async function publishNowAction(input: unknown): Promise<ActionResult<{ status: string; message: string }>> {
  const parsed = id.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const app = await requireAppContext();
    const rl = checkRateLimit(`publishNow:${app.user.id}`, RATE_LIMITS.publishNow.limit, RATE_LIMITS.publishNow.windowMs);
    if (!rl.ok) return { ok: false, error: rateLimitMessage(rl.retryAfterSeconds) };
    const job = await publishNow(app, parsed.data);
    refresh();
    const message =
      job.status === "published"
        ? "投稿しました"
        : job.status === "publishing"
          ? "SNS側で動画を処理中です。完了すると自動で公開されます"
          : job.status === "retrying"
            ? `投稿に失敗したため自動で再試行します：${job.lastError ?? ""}`
            : `投稿に失敗しました`;
    return { ok: true, data: { status: job.status, message } };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "投稿に失敗しました") };
  }
}

export async function cancelPublishJobAction(input: unknown): Promise<ActionResult> {
  const parsed = id.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await cancelJob(await requireAppContext(), parsed.data);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "取り消しに失敗しました") };
  }
}

// ---------------------------------------------------------------------------
// Media upload (signed upload URL → browser uploads directly → confirm)
// ---------------------------------------------------------------------------

const prepareSchema = z.object({
  postId: id,
  mimeType: z.string().refine((v) => v in ACCEPTED_MIME, "JPEG / PNG / MP4 / MOV のみアップロードできます"),
  sizeBytes: z.number().int().positive().max(UPLOAD_MAX_BYTES, "1GB以下のファイルを選んでください"),
  width: z.number().int().positive().max(20000).nullable(),
  height: z.number().int().positive().max(20000).nullable(),
  durationMs: z.number().int().min(0).max(4 * 3600 * 1000).nullable(),
});

export async function prepareMediaUploadAction(input: unknown): Promise<ActionResult<{ mediaId: ID; upload: UploadTarget }>> {
  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const d = parsed.data;
  if (getDataMode() === "demo" && d.sizeBytes > DEMO_MEDIA_MAX_BYTES) return { ok: false, error: "デモモードでは4MBまでのファイルをアップロードできます" };
  try {
    const app = await requireAppContext();
    const ctx = await getSocialContext(app);
    const post = (await app.repo.listPosts(ctx.organizationId)).find((p) => p.id === d.postId);
    if (!post) return { ok: false, error: "投稿が見つかりません" };
    if (post.status === "queued" || post.status === "publishing" || post.status === "published") return { ok: false, error: "予約・公開済みの投稿のメディアは変更できません" };
    const writer = assertCanEdit(ctx, post.locationId);
    const existing = await writer.listMedia(ctx.organizationId, post.id);
    if (existing.length >= 10) return { ok: false, error: "1投稿あたりのメディアは10件までです" };
    const placeholderId = crypto.randomUUID();
    const media = await writer.createMedia({
      organizationId: ctx.organizationId,
      locationId: post.locationId,
      postId: post.id,
      storagePath: storagePathFor(ctx.organizationId, post.locationId, post.id, placeholderId, d.mimeType),
      kind: ACCEPTED_MIME[d.mimeType] ?? "image",
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      width: d.width,
      height: d.height,
      durationMs: d.durationMs,
      sortOrder: existing.length,
    });
    return { ok: true, data: { mediaId: media.id, upload: await createUploadTarget(media) } };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "アップロードの準備に失敗しました") };
  }
}

export async function confirmMediaUploadAction(input: unknown): Promise<ActionResult> {
  const parsed = id.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const app = await requireAppContext();
    const ctx = await getSocialContext(app);
    const media = await ctx.reader.getMedia(ctx.organizationId, parsed.data);
    if (!media) return { ok: false, error: "メディアが見つかりません" };
    const writer = assertCanEdit(ctx, media.locationId);
    const stored = await verifyUploadedObject(media);
    if (!stored) {
      await writer.updateMedia(ctx.organizationId, media.id, { status: "failed" });
      return { ok: false, error: "アップロードを確認できませんでした。もう一度お試しください" };
    }
    // Trust the stored object's size, not the browser's claim.
    await writer.updateMedia(ctx.organizationId, media.id, { status: "ready", sizeBytes: stored.sizeBytes || media.sizeBytes });
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "アップロードの確認に失敗しました") };
  }
}

export async function deleteMediaAction(input: unknown): Promise<ActionResult> {
  const parsed = id.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const app = await requireAppContext();
    const ctx = await getSocialContext(app);
    const media = await ctx.reader.getMedia(ctx.organizationId, parsed.data);
    if (!media) return { ok: true, data: undefined };
    const post = media.postId ? (await app.repo.listPosts(ctx.organizationId)).find((p) => p.id === media.postId) : null;
    if (post && (post.status === "queued" || post.status === "publishing" || post.status === "published")) return { ok: false, error: "予約・公開済みの投稿のメディアは削除できません" };
    const writer = assertCanEdit(ctx, media.locationId);
    await writer.deleteMedia(ctx.organizationId, media.id);
    await deleteStoredObject(media);
    if (post?.status === "approved") await writer.updatePostPublishing(ctx.organizationId, post.id, { status: post.scheduledAt ? "scheduled" : "draft", approvedAt: null, approvedBy: null });
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "削除に失敗しました") };
  }
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

const completeSchema = z.object({
  pendingId: id,
  externalAccountId: z.string().min(1).max(100),
  target: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("existing"), accountId: id }),
    z.object({ mode: z.literal("new"), locationId: id.nullable(), goal: z.enum(ACCOUNT_GOALS), displayName: z.string().trim().max(80) }),
  ]),
});

export async function completeConnectionAction(input: unknown): Promise<ActionResult<{ handle: string }>> {
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const account = await completeConnection(await requireAppContext(), parsed.data);
    refresh();
    return { ok: true, data: { handle: account.handle } };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "接続の保存に失敗しました") };
  }
}

export async function disconnectAccountAction(input: unknown): Promise<ActionResult> {
  const parsed = id.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await disconnectAccount(await requireAppContext(), parsed.data);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "接続解除に失敗しました") };
  }
}

// ---------------------------------------------------------------------------
// Measure / Analyze / Learn
// ---------------------------------------------------------------------------

export async function syncPostInsightsAction(input: unknown): Promise<ActionResult<{ snapshots: number }>> {
  const parsed = id.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const app = await requireAppContext();
    const ctx = await getSocialContext(app);
    const post = (await app.repo.listPosts(ctx.organizationId)).find((p) => p.id === parsed.data);
    if (!post) return { ok: false, error: "投稿が見つかりません" };
    const rl = checkRateLimit(`insightsSync:${app.user.id}`, RATE_LIMITS.insightsSync.limit, RATE_LIMITS.insightsSync.windowMs);
    if (!rl.ok) return { ok: false, error: rateLimitMessage(rl.retryAfterSeconds) };
    const writer = assertCanEdit(ctx, post.locationId);
    const summary = await syncInsights(writer, { organizationId: ctx.organizationId, postId: post.id, force: true, maxReviews: 0 });
    refresh();
    if (summary.errors && !summary.postSnapshots) return { ok: false, error: "Insightsを取得できませんでした（イベントログを確認してください）" };
    return { ok: true, data: { snapshots: summary.postSnapshots } };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Insightsの取得に失敗しました") };
  }
}

export async function reviewPostAction(input: unknown): Promise<ActionResult<PerformanceReview>> {
  const parsed = id.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const app = await requireAppContext();
    const ctx = await getSocialContext(app);
    const post = (await app.repo.listPosts(ctx.organizationId)).find((p) => p.id === parsed.data);
    if (!post) return { ok: false, error: "投稿が見つかりません" };
    const rl = checkRateLimit(`aiReview:${app.user.id}`, RATE_LIMITS.aiReview.limit, RATE_LIMITS.aiReview.windowMs);
    if (!rl.ok) return { ok: false, error: rateLimitMessage(rl.retryAfterSeconds) };
    const writer = assertCanEdit(ctx, post.locationId);
    const review = await reviewPostPerformance({ store: writer, repo: app.repo }, ctx.organizationId, post.id, ctx.userId);
    refresh();
    revalidatePath("/memory");
    revalidatePath("/analysis");
    return { ok: true, data: review };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "AI分析に失敗しました") };
  }
}

export async function setLearningStatusAction(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ id, status: z.enum(["active", "archived"]) }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const app = await requireAppContext();
    const ctx = await getSocialContext(app);
    const learning = (await ctx.reader.listLearnings(ctx.organizationId)).find((l) => l.id === parsed.data.id);
    if (!learning) return { ok: false, error: "見つかりません" };
    await assertCanEdit(ctx, learning.locationId).setLearningStatus(ctx.organizationId, parsed.data.id, parsed.data.status);
    revalidatePath("/memory");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "更新に失敗しました") };
  }
}

/**
 * Runs the queue + insights sync for the current organization now.
 * Demo Mode has no background scheduler per instance, so this is how the demo
 * advances; in production admins can use it to retry immediately.
 */
export async function runSocialQueueAction(): Promise<ActionResult<{ published: number; snapshots: number; reviews: number }>> {
  try {
    const app = await requireAppContext();
    const ctx = await getSocialContext(app);
    if (!(ctx.role === "owner" || ctx.role === "admin" || getDataMode() === "demo")) return { ok: false, error: "管理者のみ実行できます" };
    const rl = checkRateLimit(`runQueue:${app.user.id}`, RATE_LIMITS.runQueue.limit, RATE_LIMITS.runQueue.windowMs);
    if (!rl.ok) return { ok: false, error: rateLimitMessage(rl.retryAfterSeconds) };
    const writer = assertCanEdit(ctx, null);
    const publish = await processDueJobs(writer, { organizationId: ctx.organizationId, limit: 20 });
    const insights = await syncInsights(writer, { organizationId: ctx.organizationId, repo: app.repo, maxReviews: 3 });
    refresh();
    revalidatePath("/memory");
    return { ok: true, data: { published: publish.published, snapshots: insights.postSnapshots, reviews: insights.reviews } };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "キューの処理に失敗しました") };
  }
}

export async function setPostAccountAction(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ postId: id, accountId: id.nullable() }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const app = await requireAppContext();
    const ctx = await getSocialContext(app);
    const orgId = ctx.organizationId;
    const post = (await app.repo.listPosts(orgId)).find((p) => p.id === parsed.data.postId);
    if (!post) return { ok: false, error: "投稿が見つかりません" };
    if (post.status === "queued" || post.status === "publishing" || post.status === "published") return { ok: false, error: "予約・公開済みの投稿は投稿先を変更できません" };
    const account = parsed.data.accountId ? (await app.repo.listAccounts(orgId)).find((a) => a.id === parsed.data.accountId) : null;
    if (parsed.data.accountId && (!account || account.platform !== post.platform)) return { ok: false, error: "投稿と同じプラットフォームのアカウントを選択してください" };
    if (account && !canAccessLocation(ctx, account.locationId)) return { ok: false, error: "この店舗のアカウントは選択できません" };
    const writer = assertCanEdit(ctx, post.locationId);
    await app.repo.updatePost(orgId, post.id, { accountId: parsed.data.accountId });
    // The approval covered the old target account.
    if (post.status === "approved") await writer.updatePostPublishing(orgId, post.id, { status: post.scheduledAt ? "scheduled" : "draft", approvedAt: null, approvedBy: null });
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "投稿先の変更に失敗しました") };
  }
}
