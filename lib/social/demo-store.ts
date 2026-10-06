import "server-only";
import type { ID } from "@/lib/domain/types";
import { getDemoStore, newId, persistDemoStore } from "@/lib/data/demo-store";
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
  ContentLearning,
  ContentLearningInput,
  MediaAsset,
  MetricSnapshot,
  PerformanceReview,
  PublishJob,
  PublishJobStatus,
  PublishablePlatform,
  SocialEvent,
  SocialEventInput,
  TokenSet,
} from "./types";

const nowIso = () => new Date().toISOString();
const clone = <T>(v: T): T => structuredClone(v);

/**
 * In-memory SocialStore for Demo Mode (same semantics as Supabase).
 * Tenant isolation is enforced by always filtering on organizationId; the
 * caller resolves organizationId from the user's verified membership.
 * Tokens are encrypted here too, so demo and production share the code path.
 */
export class DemoSocialStore implements SocialStore {
  readonly privileged = true;

  constructor(private readonly idGen: () => ID = newId) {}

  private get data() {
    return getDemoStore().social;
  }

  private save() {
    persistDemoStore();
  }

  async updateConnection(organizationId: ID, accountId: ID, patch: ConnectionPatch): Promise<void> {
    const account = getDemoStore().accounts.find((a) => a.id === accountId && a.organizationId === organizationId);
    if (!account) throw new SocialStoreError("account not found", "not_found");
    const { handle, displayName, connectedBy: _by, ...connection } = patch;
    account.connection = { ...account.connection, ...connection };
    account.connectionStatus = account.connection.status;
    if (handle !== undefined) account.handle = handle;
    if (displayName !== undefined) account.displayName = displayName;
    this.save();
  }

  async findAccountIdByExternalId(organizationId: ID, platform: PublishablePlatform, externalAccountId: string): Promise<ID | null> {
    return (
      getDemoStore().accounts.find((a) => a.organizationId === organizationId && a.platform === platform && a.connection.externalAccountId === externalAccountId)?.id ?? null
    );
  }

  async getOrganizationMeta(organizationId: ID) {
    const org = getDemoStore().organizations.find((o) => o.id === organizationId);
    return org ? { isDemo: org.isDemo, timezone: org.timezone ?? "Asia/Tokyo" } : null;
  }

  async getAccountSummary(organizationId: ID, accountId: ID) {
    const a = getDemoStore().accounts.find((x) => x.id === accountId && x.organizationId === organizationId);
    return a
      ? { id: a.id, platform: a.platform, handle: a.handle, locationId: a.locationId, goal: a.goal, status: a.connection.status, tokenExpiresAt: a.connection.tokenExpiresAt }
      : null;
  }

  async saveCredential(organizationId: ID, accountId: ID, provider: PublishablePlatform, externalAccountId: string, token: TokenSet): Promise<void> {
    const list = this.data.credentials;
    const existing = list.find((c) => c.socialAccountId === accountId && c.organizationId === organizationId);
    const record = {
      organizationId,
      socialAccountId: accountId,
      provider,
      externalAccountId,
      ciphertext: encryptSecret(token.accessToken),
      tokenExpiresAt: token.expiresAt,
      scopes: [...token.scopes],
      lastRefreshedAt: existing ? nowIso() : null,
      refreshFailures: 0,
      createdAt: existing?.createdAt ?? nowIso(),
    };
    if (existing) Object.assign(existing, record);
    else list.push(record);
    this.save();
  }

  async getCredential(organizationId: ID, accountId: ID): Promise<StoredCredential | null> {
    const c = this.data.credentials.find((x) => x.socialAccountId === accountId && x.organizationId === organizationId);
    if (!c) return null;
    return {
      token: { accessToken: decryptSecret(c.ciphertext), expiresAt: c.tokenExpiresAt, scopes: [...c.scopes] },
      externalAccountId: c.externalAccountId,
      provider: c.provider,
      lastRefreshedAt: c.lastRefreshedAt,
      refreshFailures: c.refreshFailures,
      createdAt: c.createdAt,
    };
  }

  async markRefreshFailure(organizationId: ID, accountId: ID): Promise<number> {
    const c = this.data.credentials.find((x) => x.socialAccountId === accountId && x.organizationId === organizationId);
    if (!c) return 0;
    c.refreshFailures += 1;
    this.save();
    return c.refreshFailures;
  }

  async deleteCredential(organizationId: ID, accountId: ID): Promise<void> {
    this.data.credentials = this.data.credentials.filter((c) => !(c.socialAccountId === accountId && c.organizationId === organizationId));
    this.save();
  }

  async deleteCredentialsByExternalId(provider: PublishablePlatform, externalAccountId: string) {
    const removed = this.data.credentials.filter((c) => c.provider === provider && c.externalAccountId === externalAccountId);
    this.data.credentials = this.data.credentials.filter((c) => !removed.includes(c));
    this.save();
    return removed.map((c) => ({ organizationId: c.organizationId, socialAccountId: c.socialAccountId }));
  }

  async systemListCredentialsExpiringBefore(before: string) {
    return this.data.credentials
      .filter((c) => c.tokenExpiresAt !== null && c.tokenExpiresAt < before)
      .map((c) => ({ organizationId: c.organizationId, socialAccountId: c.socialAccountId, provider: c.provider, tokenExpiresAt: c.tokenExpiresAt }));
  }

  async createPending(input: Omit<PendingConnection, "id" | "expiresAt">): Promise<ID> {
    const id = this.idGen();
    this.data.pending = this.data.pending.filter((p) => p.expiresAt > nowIso() && !p.consumedAt);
    this.data.pending.push({
      id,
      organizationId: input.organizationId,
      userId: input.userId,
      provider: input.provider,
      candidates: clone(input.candidates),
      ciphertext: encryptSecret(input.token.accessToken),
      tokenExpiresAt: input.token.expiresAt,
      scopes: [...input.token.scopes],
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      consumedAt: null,
    });
    this.save();
    return id;
  }

  async getPending(id: ID, organizationId: ID, userId: ID): Promise<PendingConnection | null> {
    const p = this.data.pending.find((x) => x.id === id && x.organizationId === organizationId && x.userId === userId);
    if (!p || p.consumedAt || p.expiresAt < nowIso()) return null;
    return {
      id: p.id,
      organizationId: p.organizationId,
      userId: p.userId,
      provider: p.provider,
      candidates: clone(p.candidates),
      token: { accessToken: decryptSecret(p.ciphertext), expiresAt: p.tokenExpiresAt, scopes: [...p.scopes] },
      expiresAt: p.expiresAt,
    };
  }

  async consumePending(id: ID): Promise<void> {
    const p = this.data.pending.find((x) => x.id === id);
    if (p) p.consumedAt = nowIso();
    this.save();
  }

  async createMedia(input: NewMediaAsset): Promise<MediaAsset> {
    const media: MediaAsset = { ...clone(input), id: this.idGen(), status: input.status ?? "pending", createdAt: nowIso() };
    this.data.media.push(media);
    this.save();
    return clone(media);
  }

  async updateMedia(organizationId: ID, id: ID, patch: Parameters<SocialStore["updateMedia"]>[2]): Promise<MediaAsset> {
    const media = this.data.media.find((m) => m.id === id && m.organizationId === organizationId);
    if (!media) throw new SocialStoreError("media not found", "not_found");
    Object.assign(media, patch);
    this.save();
    return clone(media);
  }

  async listMedia(organizationId: ID, postId: ID): Promise<MediaAsset[]> {
    return clone(this.data.media.filter((m) => m.organizationId === organizationId && m.postId === postId).sort((a, b) => a.sortOrder - b.sortOrder));
  }

  async getMedia(organizationId: ID, id: ID): Promise<MediaAsset | null> {
    const m = this.data.media.find((x) => x.id === id && x.organizationId === organizationId);
    return m ? clone(m) : null;
  }

  async deleteMedia(organizationId: ID, id: ID): Promise<void> {
    this.data.media = this.data.media.filter((m) => !(m.id === id && m.organizationId === organizationId));
    this.save();
  }

  async createJob(input: NewPublishJob): Promise<PublishJob> {
    const active = this.data.jobs.find((j) => j.postId === input.postId && ["queued", "publishing", "retrying"].includes(j.status));
    if (active) throw new SocialStoreError("an active publish job already exists for this post", "conflict");
    const job: PublishJob = {
      id: this.idGen(),
      organizationId: input.organizationId,
      locationId: input.locationId,
      socialAccountId: input.socialAccountId,
      postId: input.postId,
      provider: input.provider,
      format: input.format,
      mode: input.mode,
      scheduledAt: input.scheduledAt,
      status: "queued",
      attemptCount: 0,
      maxAttempts: input.maxAttempts,
      nextAttemptAt: input.scheduledAt,
      lockedUntil: null,
      content: clone(input.content),
      providerContainerId: null,
      providerPostId: null,
      providerPermalink: null,
      lastError: null,
      lastErrorCode: null,
      publishedAt: null,
      requestedBy: input.requestedBy,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.data.jobs.push(job);
    this.save();
    return clone(job);
  }

  async getJob(organizationId: ID, id: ID): Promise<PublishJob | null> {
    const j = this.data.jobs.find((x) => x.id === id && x.organizationId === organizationId);
    return j ? clone(j) : null;
  }

  async listJobs(organizationId: ID, options: { statuses?: PublishJobStatus[]; postId?: ID; limit?: number } = {}): Promise<PublishJob[]> {
    return clone(
      this.data.jobs
        .filter((j) => j.organizationId === organizationId && (!options.statuses || options.statuses.includes(j.status)) && (!options.postId || j.postId === options.postId))
        .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
        .slice(0, options.limit ?? 200),
    );
  }

  async updateJob(organizationId: ID, id: ID, patch: PublishJobPatch, expect?: { statuses: PublishJobStatus[] }): Promise<PublishJob | null> {
    const job = this.data.jobs.find((j) => j.id === id && j.organizationId === organizationId);
    if (!job) return null;
    if (expect && !expect.statuses.includes(job.status)) return null;
    const { providerResponse: _response, ...rest } = patch;
    Object.assign(job, rest, { updatedAt: nowIso() });
    if (rest.lastError) job.lastError = sanitize(rest.lastError);
    this.save();
    return clone(job);
  }

  async systemClaimDueJobs(now: Date, limit: number, lockSeconds: number, organizationId?: ID): Promise<PublishJob[]> {
    const iso = now.toISOString();
    const due = this.data.jobs
      .filter(
        (j) =>
          (!organizationId || j.organizationId === organizationId) &&
          (((j.status === "queued" || j.status === "retrying") && j.nextAttemptAt <= iso) ||
            (j.status === "publishing" && (!j.lockedUntil || j.lockedUntil <= iso) && j.nextAttemptAt <= iso)),
      )
      .sort((a, b) => a.nextAttemptAt.localeCompare(b.nextAttemptAt))
      .slice(0, limit);
    const lockedUntil = new Date(now.getTime() + lockSeconds * 1000).toISOString();
    for (const j of due) Object.assign(j, { status: "publishing", lockedUntil, updatedAt: iso });
    this.save();
    return clone(due);
  }

  async countPublishedSince(organizationId: ID, accountId: ID, since: string): Promise<number> {
    return this.data.jobs.filter((j) => j.organizationId === organizationId && j.socialAccountId === accountId && j.status === "published" && (j.publishedAt ?? "") >= since).length;
  }

  async updatePostPublishing(organizationId: ID, postId: ID, patch: PostPublishingPatch): Promise<void> {
    const post = getDemoStore().posts.find((p) => p.id === postId && p.organizationId === organizationId);
    if (!post) throw new SocialStoreError("post not found", "not_found");
    const { status, ...publishing } = patch;
    if (status) post.status = status;
    post.publishing = { ...post.publishing, ...publishing };
    this.save();
  }

  async systemListPublishedJobs(publishedAfter: string, organizationId?: ID): Promise<PublishJob[]> {
    return clone(
      this.data.jobs
        .filter((j) => j.status === "published" && (j.publishedAt ?? "") >= publishedAfter && (!organizationId || j.organizationId === organizationId))
        .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")),
    );
  }

  async addSnapshot(input: NewSnapshot): Promise<MetricSnapshot> {
    const snapshot: MetricSnapshot = { ...clone(input), id: this.idGen() };
    this.data.snapshots.push(snapshot);
    this.save();
    return clone(snapshot);
  }

  async listSnapshots(organizationId: ID, options: { postIds?: ID[]; accountId?: ID; scope?: "post" | "account"; since?: string } = {}): Promise<MetricSnapshot[]> {
    const postIds = options.postIds ? new Set(options.postIds) : null;
    return clone(
      this.data.snapshots
        .filter(
          (s) =>
            s.organizationId === organizationId &&
            (!postIds || (s.postId !== null && postIds.has(s.postId))) &&
            (!options.accountId || s.socialAccountId === options.accountId) &&
            (!options.scope || s.scope === options.scope) &&
            (!options.since || s.capturedAt >= options.since),
        )
        .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)),
    );
  }

  async addReview(input: NewReview): Promise<PerformanceReview> {
    const review: PerformanceReview = { ...clone(input), id: this.idGen(), createdAt: nowIso() };
    this.data.reviews.push(review);
    this.save();
    return clone(review);
  }

  async listReviews(organizationId: ID, options: { postId?: ID; limit?: number } = {}): Promise<PerformanceReview[]> {
    return clone(
      this.data.reviews
        .filter((r) => r.organizationId === organizationId && (!options.postId || r.postId === options.postId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, options.limit ?? 100),
    );
  }

  async addLearning(organizationId: ID, input: ContentLearningInput): Promise<ContentLearning> {
    const learning: ContentLearning = { ...clone(input), id: this.idGen(), organizationId, status: "active", createdAt: nowIso() };
    this.data.learnings.push(learning);
    this.save();
    return clone(learning);
  }

  async listLearnings(organizationId: ID, options: { status?: ContentLearning["status"] } = {}): Promise<ContentLearning[]> {
    return clone(
      this.data.learnings
        .filter((l) => l.organizationId === organizationId && (!options.status || l.status === options.status))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async setLearningStatus(organizationId: ID, id: ID, status: ContentLearning["status"]): Promise<void> {
    const l = this.data.learnings.find((x) => x.id === id && x.organizationId === organizationId);
    if (!l) throw new SocialStoreError("learning not found", "not_found");
    l.status = status;
    this.save();
  }

  async logEvent(organizationId: ID, input: SocialEventInput): Promise<void> {
    const event: SocialEvent = {
      id: this.idGen(),
      organizationId,
      type: input.type,
      level: input.level ?? "info",
      message: sanitize(input.message),
      locationId: input.locationId ?? null,
      socialAccountId: input.socialAccountId ?? null,
      postId: input.postId ?? null,
      publishJobId: input.publishJobId ?? null,
      details: clone(input.details ?? {}),
      actorUserId: input.actorUserId ?? null,
      createdAt: nowIso(),
    };
    this.data.events.push(event);
    if (this.data.events.length > 2000) this.data.events.splice(0, this.data.events.length - 2000);
    this.save();
  }

  async listEvents(organizationId: ID, options: { limit?: number; postId?: ID } = {}): Promise<SocialEvent[]> {
    return clone(
      this.data.events
        .filter((e) => e.organizationId === organizationId && (!options.postId || e.postId === options.postId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, options.limit ?? 100),
    );
  }
}
