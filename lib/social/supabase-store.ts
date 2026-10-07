import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import type { AccountGoal, ID } from "@/lib/domain/types";
import { ACCOUNT_GOALS } from "@/lib/domain/types";
import type { AnySupabaseClient } from "@/lib/supabase/admin";
import type {
  ContentLearningRow,
  Database,
  Json,
  MediaAssetRow,
  MetricSnapshotRow,
  PostPerformanceReviewRow,
  PublishJobRow,
  SocialEventLogRow,
} from "@/lib/supabase/database.types";
import { decryptSecret, encryptSecret } from "./crypto";
import { sanitize } from "./errors";
import {
  SocialStoreError,
  type ConnectionPatch,
  type NewMediaAsset,
  type NewPublishJob,
  type NewReview,
  type NewSnapshot,
  type PendingConnection,
  type PostPublishingPatch,
  type PublishJobPatch,
  type SocialStore,
  type StoredCredential,
} from "./store";
import type {
  AccountCandidate,
  ContentLearning,
  ContentLearningInput,
  ContentSnapshot,
  MediaAsset,
  MetricSnapshot,
  NormalizedMetrics,
  PerformanceReview,
  PublishFormat,
  PublishJob,
  PublishJobStatus,
  PublishablePlatform,
  SocialEvent,
  SocialEventInput,
  SocialEventType,
  TokenSet,
} from "./types";

function fail(error: PostgrestError | null, context: string): void {
  if (!error) return;
  const code = error.code === "42501" ? "forbidden" : error.code === "23505" ? "conflict" : error.code === "PGRST116" ? "not_found" : "unknown";
  throw new SocialStoreError(`${context}: ${error.message}`, code);
}

const asObject = (v: Json | null | undefined): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const toJson = (v: unknown): Json => JSON.parse(JSON.stringify(v ?? null)) as Json;
const platform = (p: string): PublishablePlatform => (p === "threads" ? "threads" : "instagram");
const goal = (g: string | null): AccountGoal | null => ((ACCOUNT_GOALS as readonly string[]).includes(g ?? "") ? (g as AccountGoal) : null);

function toJob(r: PublishJobRow): PublishJob {
  const c = asObject(r.content_snapshot);
  const content: ContentSnapshot = {
    text: String(c.text ?? ""),
    mediaIds: Array.isArray(c.mediaIds) ? c.mediaIds.map(String) : [],
    contentType: String(c.contentType ?? ""),
    format: (c.format ?? r.publish_format) as PublishFormat,
    title: String(c.title ?? ""),
  };
  return {
    id: r.id,
    organizationId: r.organization_id,
    locationId: r.location_id,
    socialAccountId: r.social_account_id,
    postId: r.post_id,
    provider: platform(r.provider),
    format: r.publish_format as PublishFormat,
    mode: r.mode,
    scheduledAt: r.scheduled_at,
    status: r.status,
    attemptCount: r.attempt_count,
    maxAttempts: r.max_attempts,
    nextAttemptAt: r.next_attempt_at,
    lockedUntil: r.locked_until,
    content,
    providerContainerId: r.provider_container_id,
    providerPostId: r.provider_post_id,
    providerPermalink: r.provider_permalink,
    lastError: r.last_error,
    lastErrorCode: r.last_error_code,
    publishedAt: r.published_at,
    requestedBy: r.requested_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toMedia(r: MediaAssetRow): MediaAsset {
  return {
    id: r.id,
    organizationId: r.organization_id,
    locationId: r.location_id,
    postId: r.post_id,
    storagePath: r.storage_path,
    kind: r.kind,
    mimeType: r.mime_type,
    sizeBytes: Number(r.size_bytes),
    width: r.width,
    height: r.height,
    durationMs: r.duration_ms,
    status: r.status,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  };
}

function toSnapshot(r: MetricSnapshotRow): MetricSnapshot {
  return {
    id: r.id,
    organizationId: r.organization_id,
    locationId: r.location_id,
    socialAccountId: r.social_account_id,
    postId: r.post_id,
    provider: platform(r.provider),
    scope: r.scope,
    providerPostId: r.provider_post_id,
    capturedAt: r.captured_at,
    hoursSincePublish: r.hours_since_publish === null ? null : Number(r.hours_since_publish),
    metrics: asObject(r.metrics) as NormalizedMetrics,
  };
}

function toReview(r: PostPerformanceReviewRow): PerformanceReview {
  return {
    id: r.id,
    organizationId: r.organization_id,
    locationId: r.location_id,
    socialAccountId: r.social_account_id,
    postId: r.post_id,
    snapshotId: r.snapshot_id,
    summary: r.summary,
    whatWorked: r.what_worked,
    whatDidNotWork: r.what_did_not_work,
    possibleReasons: r.possible_reasons,
    keyLearning: r.key_learning,
    recommendedNextAction: r.recommended_next_action,
    nextCreativeHypothesis: r.next_creative_hypothesis,
    confidence: Number(r.confidence),
    aiProvider: r.ai_provider,
    createdAt: r.created_at,
  };
}

function toLearning(r: ContentLearningRow): ContentLearning {
  const p = r.platform;
  return {
    id: r.id,
    organizationId: r.organization_id,
    locationId: r.location_id,
    socialAccountId: r.social_account_id,
    platform: p === "instagram" || p === "threads" || p === "tiktok" || p === "facebook" ? p : null,
    goal: goal(r.goal),
    contentPillar: r.content_pillar,
    hypothesis: r.hypothesis,
    result: r.result,
    learning: r.learning,
    confidence: Number(r.confidence),
    validFrom: r.valid_from,
    validUntil: r.valid_until,
    sourcePostIds: r.source_post_ids,
    sourceReviewId: r.source_review_id,
    status: r.status,
    createdAt: r.created_at,
    kind: r.kind ?? "content",
    attributes: Object.fromEntries(Object.entries(asObject(r.attributes)).filter((e): e is [string, string] => typeof e[1] === "string")),
    sourceExperimentId: r.source_experiment_id ?? null,
  };
}

function toEvent(r: SocialEventLogRow): SocialEvent {
  const details = Object.fromEntries(
    Object.entries(asObject(r.details)).filter((e): e is [string, string | number | boolean | null] => e[1] === null || ["string", "number", "boolean"].includes(typeof e[1])),
  );
  return {
    id: r.id,
    organizationId: r.organization_id,
    type: r.event_type as SocialEventType,
    level: r.level,
    message: r.message,
    locationId: r.location_id,
    socialAccountId: r.social_account_id,
    postId: r.post_id,
    publishJobId: r.publish_job_id,
    details,
    actorUserId: r.actor_user_id,
    createdAt: r.created_at,
  };
}

/**
 * Supabase-backed SocialStore. Pass the user's client for reads (RLS incl.
 * location scope) or the service-role client for the worker / authorized writes.
 */
export class SupabaseSocialStore implements SocialStore {
  constructor(
    private readonly db: AnySupabaseClient,
    readonly privileged: boolean,
  ) {}

  async updateConnection(organizationId: ID, accountId: ID, patch: ConnectionPatch): Promise<void> {
    const update: Database["public"]["Tables"]["social_accounts"]["Update"] = {};
    if (patch.status !== undefined) update.connection_status = patch.status;
    if (patch.externalAccountId !== undefined) update.external_account_id = patch.externalAccountId;
    if (patch.username !== undefined) update.username = patch.username;
    if (patch.profileImageUrl !== undefined) update.profile_image_url = patch.profileImageUrl;
    if (patch.tokenExpiresAt !== undefined) update.token_expires_at = patch.tokenExpiresAt;
    if (patch.scopes !== undefined) update.scopes = patch.scopes;
    if (patch.connectedAt !== undefined) update.connected_at = patch.connectedAt;
    if (patch.lastSyncedAt !== undefined) update.last_synced_at = patch.lastSyncedAt;
    if (patch.error !== undefined) update.connection_error = patch.error ? sanitize(patch.error) : null;
    if (patch.metadata !== undefined) update.provider_metadata = toJson(patch.metadata);
    if (patch.handle !== undefined) update.handle = patch.handle;
    if (patch.displayName !== undefined) update.display_name = patch.displayName;
    if (patch.connectedBy !== undefined) update.connected_by = patch.connectedBy;
    const { error } = await this.db.from("social_accounts").update(update).eq("id", accountId).eq("organization_id", organizationId);
    fail(error, "updateConnection");
  }

  async findAccountIdByExternalId(organizationId: ID, p: PublishablePlatform, externalAccountId: string): Promise<ID | null> {
    const { data, error } = await this.db
      .from("social_accounts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("platform", p)
      .eq("external_account_id", externalAccountId)
      .maybeSingle();
    fail(error, "findAccountIdByExternalId");
    return data?.id ?? null;
  }

  async getOrganizationMeta(organizationId: ID) {
    const { data, error } = await this.db.from("organizations").select("is_demo, timezone").eq("id", organizationId).maybeSingle();
    fail(error, "getOrganizationMeta");
    return data ? { isDemo: data.is_demo, timezone: data.timezone ?? "Asia/Tokyo" } : null;
  }

  async getAccountSummary(organizationId: ID, accountId: ID) {
    const { data, error } = await this.db
      .from("social_accounts")
      .select("id, platform, handle, location_id, goal, connection_status, token_expires_at")
      .eq("organization_id", organizationId)
      .eq("id", accountId)
      .maybeSingle();
    fail(error, "getAccountSummary");
    return data
      ? { id: data.id, platform: data.platform, handle: data.handle, locationId: data.location_id, goal: data.goal, status: data.connection_status, tokenExpiresAt: data.token_expires_at }
      : null;
  }

  async saveCredential(organizationId: ID, accountId: ID, provider: PublishablePlatform, externalAccountId: string, token: TokenSet): Promise<void> {
    const { error } = await this.db.from("social_account_credentials").upsert(
      {
        social_account_id: accountId,
        organization_id: organizationId,
        provider,
        external_account_id: externalAccountId,
        access_token_ciphertext: encryptSecret(token.accessToken),
        token_expires_at: token.expiresAt,
        scopes: token.scopes,
        last_refreshed_at: new Date().toISOString(),
        refresh_failures: 0,
      },
      { onConflict: "social_account_id" },
    );
    fail(error, "saveCredential");
  }

  async getCredential(organizationId: ID, accountId: ID): Promise<StoredCredential | null> {
    const { data, error } = await this.db
      .from("social_account_credentials")
      .select("*")
      .eq("social_account_id", accountId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    fail(error, "getCredential");
    if (!data) return null;
    return {
      token: { accessToken: decryptSecret(data.access_token_ciphertext), expiresAt: data.token_expires_at, scopes: data.scopes },
      externalAccountId: data.external_account_id,
      provider: platform(data.provider),
      lastRefreshedAt: data.last_refreshed_at,
      refreshFailures: data.refresh_failures,
      createdAt: data.created_at,
    };
  }

  async markRefreshFailure(organizationId: ID, accountId: ID): Promise<number> {
    const current = await this.db.from("social_account_credentials").select("refresh_failures").eq("social_account_id", accountId).eq("organization_id", organizationId).maybeSingle();
    fail(current.error, "markRefreshFailure.read");
    const failures = (current.data?.refresh_failures ?? 0) + 1;
    const { error } = await this.db.from("social_account_credentials").update({ refresh_failures: failures }).eq("social_account_id", accountId).eq("organization_id", organizationId);
    fail(error, "markRefreshFailure");
    return failures;
  }

  async deleteCredential(organizationId: ID, accountId: ID): Promise<void> {
    const { error } = await this.db.from("social_account_credentials").delete().eq("social_account_id", accountId).eq("organization_id", organizationId);
    fail(error, "deleteCredential");
  }

  async deleteCredentialsByExternalId(provider: PublishablePlatform, externalAccountId: string) {
    const { data, error } = await this.db
      .from("social_account_credentials")
      .delete()
      .eq("provider", provider)
      .eq("external_account_id", externalAccountId)
      .select("organization_id, social_account_id");
    fail(error, "deleteCredentialsByExternalId");
    return (data ?? []).map((r) => ({ organizationId: r.organization_id, socialAccountId: r.social_account_id }));
  }

  async systemListCredentialsExpiringBefore(before: string) {
    const { data, error } = await this.db
      .from("social_account_credentials")
      .select("organization_id, social_account_id, provider, token_expires_at")
      .lt("token_expires_at", before)
      .limit(200);
    fail(error, "systemListCredentialsExpiringBefore");
    return (data ?? []).map((r) => ({ organizationId: r.organization_id, socialAccountId: r.social_account_id, provider: platform(r.provider), tokenExpiresAt: r.token_expires_at }));
  }

  async createPending(input: Omit<PendingConnection, "id" | "expiresAt">): Promise<ID> {
    const { data, error } = await this.db
      .from("social_oauth_pending")
      .insert({
        organization_id: input.organizationId,
        user_id: input.userId,
        provider: input.provider,
        candidates: toJson(input.candidates),
        access_token_ciphertext: encryptSecret(input.token.accessToken),
        token_expires_at: input.token.expiresAt,
        scopes: input.token.scopes,
      })
      .select("id")
      .single();
    fail(error, "createPending");
    if (!data) throw new SocialStoreError("pending not created");
    return data.id;
  }

  async getPending(id: ID, organizationId: ID, userId: ID): Promise<PendingConnection | null> {
    const { data, error } = await this.db
      .from("social_oauth_pending")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    fail(error, "getPending");
    if (!data) return null;
    return {
      id: data.id,
      organizationId: data.organization_id,
      userId: data.user_id,
      provider: platform(data.provider),
      candidates: (Array.isArray(data.candidates) ? data.candidates : []) as unknown as AccountCandidate[],
      token: { accessToken: decryptSecret(data.access_token_ciphertext), expiresAt: data.token_expires_at, scopes: data.scopes },
      expiresAt: data.expires_at,
    };
  }

  async consumePending(id: ID): Promise<void> {
    const { error } = await this.db.from("social_oauth_pending").update({ consumed_at: new Date().toISOString() }).eq("id", id);
    fail(error, "consumePending");
  }

  async createMedia(input: NewMediaAsset): Promise<MediaAsset> {
    const { data, error } = await this.db
      .from("media_assets")
      .insert({
        organization_id: input.organizationId,
        location_id: input.locationId,
        post_id: input.postId,
        storage_path: input.storagePath,
        kind: input.kind,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        width: input.width,
        height: input.height,
        duration_ms: input.durationMs,
        status: input.status ?? "pending",
        sort_order: input.sortOrder,
      })
      .select("*")
      .single();
    fail(error, "createMedia");
    if (!data) throw new SocialStoreError("media not created");
    return toMedia(data);
  }

  async updateMedia(organizationId: ID, id: ID, patch: Parameters<SocialStore["updateMedia"]>[2]): Promise<MediaAsset> {
    const { data, error } = await this.db
      .from("media_assets")
      .update({
        status: patch.status,
        size_bytes: patch.sizeBytes,
        width: patch.width,
        height: patch.height,
        duration_ms: patch.durationMs,
        sort_order: patch.sortOrder,
        post_id: patch.postId,
      })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select("*")
      .single();
    fail(error, "updateMedia");
    if (!data) throw new SocialStoreError("media not found", "not_found");
    return toMedia(data);
  }

  async listMedia(organizationId: ID, postId: ID): Promise<MediaAsset[]> {
    const { data, error } = await this.db.from("media_assets").select("*").eq("organization_id", organizationId).eq("post_id", postId).order("sort_order");
    fail(error, "listMedia");
    return (data ?? []).map(toMedia);
  }

  async getMedia(organizationId: ID, id: ID): Promise<MediaAsset | null> {
    const { data, error } = await this.db.from("media_assets").select("*").eq("organization_id", organizationId).eq("id", id).maybeSingle();
    fail(error, "getMedia");
    return data ? toMedia(data) : null;
  }

  async deleteMedia(organizationId: ID, id: ID): Promise<void> {
    const { error } = await this.db.from("media_assets").delete().eq("organization_id", organizationId).eq("id", id);
    fail(error, "deleteMedia");
  }

  async createJob(input: NewPublishJob): Promise<PublishJob> {
    const { data, error } = await this.db
      .from("publish_jobs")
      .insert({
        organization_id: input.organizationId,
        location_id: input.locationId,
        social_account_id: input.socialAccountId,
        post_id: input.postId,
        provider: input.provider,
        publish_format: input.format,
        mode: input.mode,
        scheduled_at: input.scheduledAt,
        next_attempt_at: input.scheduledAt,
        max_attempts: input.maxAttempts,
        content_snapshot: toJson(input.content),
        requested_by: input.requestedBy,
      })
      .select("*")
      .single();
    fail(error, "createJob");
    if (!data) throw new SocialStoreError("job not created");
    return toJob(data);
  }

  async getJob(organizationId: ID, id: ID): Promise<PublishJob | null> {
    const { data, error } = await this.db.from("publish_jobs").select("*").eq("organization_id", organizationId).eq("id", id).maybeSingle();
    fail(error, "getJob");
    return data ? toJob(data) : null;
  }

  async listJobs(organizationId: ID, options: { statuses?: PublishJobStatus[]; postId?: ID; limit?: number } = {}): Promise<PublishJob[]> {
    let q = this.db.from("publish_jobs").select("*").eq("organization_id", organizationId);
    if (options.statuses) q = q.in("status", options.statuses);
    if (options.postId) q = q.eq("post_id", options.postId);
    const { data, error } = await q.order("scheduled_at", { ascending: false }).limit(options.limit ?? 200);
    fail(error, "listJobs");
    return (data ?? []).map(toJob);
  }

  async updateJob(organizationId: ID, id: ID, patch: PublishJobPatch, expect?: { statuses: PublishJobStatus[] }): Promise<PublishJob | null> {
    let q = this.db
      .from("publish_jobs")
      .update({
        status: patch.status,
        attempt_count: patch.attemptCount,
        next_attempt_at: patch.nextAttemptAt,
        locked_until: patch.lockedUntil,
        provider_container_id: patch.providerContainerId,
        provider_post_id: patch.providerPostId,
        provider_permalink: patch.providerPermalink,
        provider_response: patch.providerResponse === undefined ? undefined : toJson(patch.providerResponse),
        last_error: patch.lastError === undefined ? undefined : patch.lastError ? sanitize(patch.lastError) : null,
        last_error_code: patch.lastErrorCode,
        published_at: patch.publishedAt,
      })
      .eq("organization_id", organizationId)
      .eq("id", id);
    if (expect) q = q.in("status", expect.statuses);
    const { data, error } = await q.select("*").maybeSingle();
    fail(error, "updateJob");
    return data ? toJob(data) : null;
  }

  async systemClaimDueJobs(now: Date, limit: number, lockSeconds: number, organizationId?: ID): Promise<PublishJob[]> {
    const iso = now.toISOString();
    let q = this.db
      .from("publish_jobs")
      .select("id, organization_id, status, locked_until")
      .in("status", ["queued", "retrying", "publishing"])
      .lte("next_attempt_at", iso);
    if (organizationId) q = q.eq("organization_id", organizationId);
    const { data, error } = await q.order("next_attempt_at").limit(limit * 2);
    fail(error, "systemClaimDueJobs.select");
    const lockedUntil = new Date(now.getTime() + lockSeconds * 1000).toISOString();
    const claimed: PublishJob[] = [];
    for (const row of data ?? []) {
      if (claimed.length >= limit) break;
      if (row.status === "publishing" && row.locked_until && row.locked_until > iso) continue;
      // Optimistic lock: only one worker wins the conditional update.
      let u = this.db.from("publish_jobs").update({ status: "publishing", locked_until: lockedUntil }).eq("id", row.id).eq("status", row.status);
      u = row.locked_until ? u.eq("locked_until", row.locked_until) : u.is("locked_until", null);
      const { data: won, error: claimError } = await u.select("*").maybeSingle();
      fail(claimError, "systemClaimDueJobs.claim");
      if (won) claimed.push(toJob(won));
    }
    return claimed;
  }

  async countPublishedSince(organizationId: ID, accountId: ID, since: string): Promise<number> {
    const { count, error } = await this.db
      .from("publish_jobs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("social_account_id", accountId)
      .eq("status", "published")
      .gte("published_at", since);
    fail(error, "countPublishedSince");
    return count ?? 0;
  }

  async updatePostPublishing(organizationId: ID, postId: ID, patch: PostPublishingPatch): Promise<void> {
    const { error } = await this.db
      .from("posts")
      .update({
        status: patch.status,
        approved_at: patch.approvedAt,
        approved_by: patch.approvedBy,
        published_at: patch.publishedAt,
        provider_post_id: patch.providerPostId,
        permalink: patch.permalink,
        publish_error: patch.error === undefined ? undefined : patch.error ? sanitize(patch.error) : null,
      })
      .eq("organization_id", organizationId)
      .eq("id", postId);
    fail(error, "updatePostPublishing");
  }

  async systemListPublishedJobs(publishedAfter: string, organizationId?: ID): Promise<PublishJob[]> {
    let q = this.db.from("publish_jobs").select("*").eq("status", "published").gte("published_at", publishedAfter);
    if (organizationId) q = q.eq("organization_id", organizationId);
    const { data, error } = await q.order("published_at", { ascending: false }).limit(500);
    fail(error, "systemListPublishedJobs");
    return (data ?? []).map(toJob);
  }

  async addSnapshot(input: NewSnapshot): Promise<MetricSnapshot> {
    const { data, error } = await this.db
      .from("metric_snapshots")
      .insert({
        organization_id: input.organizationId,
        location_id: input.locationId,
        social_account_id: input.socialAccountId,
        post_id: input.postId,
        provider: input.provider,
        scope: input.scope,
        provider_post_id: input.providerPostId,
        captured_at: input.capturedAt,
        hours_since_publish: input.hoursSincePublish,
        metrics: toJson(input.metrics),
        raw: toJson({}),
      })
      .select("*")
      .single();
    fail(error, "addSnapshot");
    if (!data) throw new SocialStoreError("snapshot not created");
    return toSnapshot(data);
  }

  async listSnapshots(organizationId: ID, options: { postIds?: ID[]; accountId?: ID; scope?: "post" | "account"; since?: string } = {}): Promise<MetricSnapshot[]> {
    let q = this.db.from("metric_snapshots").select("*").eq("organization_id", organizationId);
    if (options.postIds) q = q.in("post_id", options.postIds.length ? options.postIds : ["00000000-0000-0000-0000-000000000000"]);
    if (options.accountId) q = q.eq("social_account_id", options.accountId);
    if (options.scope) q = q.eq("scope", options.scope);
    if (options.since) q = q.gte("captured_at", options.since);
    const { data, error } = await q.order("captured_at").limit(5000);
    fail(error, "listSnapshots");
    return (data ?? []).map(toSnapshot);
  }

  async addReview(input: NewReview): Promise<PerformanceReview> {
    const { data, error } = await this.db
      .from("post_performance_reviews")
      .insert({
        organization_id: input.organizationId,
        location_id: input.locationId,
        social_account_id: input.socialAccountId,
        post_id: input.postId,
        snapshot_id: input.snapshotId,
        summary: input.summary,
        what_worked: input.whatWorked,
        what_did_not_work: input.whatDidNotWork,
        possible_reasons: input.possibleReasons,
        key_learning: input.keyLearning,
        recommended_next_action: input.recommendedNextAction,
        next_creative_hypothesis: input.nextCreativeHypothesis,
        confidence: input.confidence,
        ai_provider: input.aiProvider,
      })
      .select("*")
      .single();
    fail(error, "addReview");
    if (!data) throw new SocialStoreError("review not created");
    return toReview(data);
  }

  async listReviews(organizationId: ID, options: { postId?: ID; limit?: number } = {}): Promise<PerformanceReview[]> {
    let q = this.db.from("post_performance_reviews").select("*").eq("organization_id", organizationId);
    if (options.postId) q = q.eq("post_id", options.postId);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(options.limit ?? 100);
    fail(error, "listReviews");
    return (data ?? []).map(toReview);
  }

  async addLearning(organizationId: ID, input: ContentLearningInput, createdBy: ID | null): Promise<ContentLearning> {
    const { data, error } = await this.db
      .from("content_learnings")
      .insert({
        organization_id: organizationId,
        location_id: input.locationId,
        social_account_id: input.socialAccountId,
        platform: input.platform,
        goal: input.goal,
        content_pillar: input.contentPillar,
        hypothesis: input.hypothesis,
        result: input.result,
        learning: input.learning,
        confidence: input.confidence,
        valid_from: input.validFrom,
        valid_until: input.validUntil,
        source_post_ids: input.sourcePostIds,
        source_review_id: input.sourceReviewId,
        created_by: createdBy,
        kind: input.kind ?? "content",
        attributes: toJson(input.attributes ?? {}),
        source_experiment_id: input.sourceExperimentId ?? null,
      })
      .select("*")
      .single();
    fail(error, "addLearning");
    if (!data) throw new SocialStoreError("learning not created");
    return toLearning(data);
  }

  async listLearnings(organizationId: ID, options: { status?: ContentLearning["status"] } = {}): Promise<ContentLearning[]> {
    let q = this.db.from("content_learnings").select("*").eq("organization_id", organizationId);
    if (options.status) q = q.eq("status", options.status);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
    fail(error, "listLearnings");
    return (data ?? []).map(toLearning);
  }

  async setLearningStatus(organizationId: ID, id: ID, status: ContentLearning["status"]): Promise<void> {
    const { error } = await this.db.from("content_learnings").update({ status }).eq("organization_id", organizationId).eq("id", id);
    fail(error, "setLearningStatus");
  }

  async logEvent(organizationId: ID, input: SocialEventInput): Promise<void> {
    const { error } = await this.db.from("social_event_logs").insert({
      organization_id: organizationId,
      event_type: input.type,
      level: input.level ?? "info",
      message: sanitize(input.message),
      location_id: input.locationId ?? null,
      social_account_id: input.socialAccountId ?? null,
      post_id: input.postId ?? null,
      publish_job_id: input.publishJobId ?? null,
      details: toJson(input.details ?? {}),
      actor_user_id: input.actorUserId ?? null,
    });
    // Logging must never break the pipeline.
    if (error) console.error("[social] logEvent failed", sanitize(error.message));
  }

  async listEvents(organizationId: ID, options: { limit?: number; postId?: ID } = {}): Promise<SocialEvent[]> {
    let q = this.db.from("social_event_logs").select("*").eq("organization_id", organizationId);
    if (options.postId) q = q.eq("post_id", options.postId);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(options.limit ?? 100);
    fail(error, "listEvents");
    return (data ?? []).map(toEvent);
  }
}
