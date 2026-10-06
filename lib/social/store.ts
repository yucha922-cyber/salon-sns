import type { ID, PostStatus } from "@/lib/domain/types";
import type {
  AccountCandidate,
  ContentLearning,
  ContentLearningInput,
  MediaAsset,
  MetricSnapshot,
  PerformanceReview,
  PublishJob,
  PublishJobStatus,
  PublishablePlatform,
  SocialConnectionInfo,
  SocialEvent,
  SocialEventInput,
  TokenSet,
} from "./types";

/**
 * Storage boundary for the publishing loop.
 *
 * Two privilege levels share this interface:
 *   - "reader" stores run as the signed-in user (Supabase RLS incl. location
 *     scope) and are used by pages.
 *   - "system" stores run with the service role and are used by the worker and
 *     by server actions AFTER an explicit permission check (lib/social/access.ts).
 * Credential methods only work on system stores (tokens are not readable with
 * the user's key at all). Every method is organization-scoped except the
 * explicitly cross-organization worker queries (prefixed with "system").
 */
export interface StoredCredential {
  token: TokenSet;
  externalAccountId: string;
  provider: PublishablePlatform;
  lastRefreshedAt: string | null;
  refreshFailures: number;
  createdAt: string;
}

export interface AccountSummary {
  id: ID;
  platform: string;
  handle: string;
  locationId: ID | null;
  goal: string;
  status: SocialConnectionInfo["status"];
  tokenExpiresAt: string | null;
}

export interface PendingConnection {
  id: ID;
  organizationId: ID;
  userId: ID;
  provider: PublishablePlatform;
  candidates: AccountCandidate[];
  token: TokenSet;
  expiresAt: string;
}

export interface ConnectionPatch extends Partial<SocialConnectionInfo> {
  handle?: string;
  displayName?: string;
  connectedBy?: ID | null;
}

export interface NewPublishJob {
  organizationId: ID;
  locationId: ID | null;
  socialAccountId: ID;
  postId: ID;
  provider: PublishablePlatform;
  format: PublishJob["format"];
  mode: PublishJob["mode"];
  scheduledAt: string;
  maxAttempts: number;
  content: PublishJob["content"];
  requestedBy: ID | null;
}

export type PublishJobPatch = Partial<
  Pick<
    PublishJob,
    | "status"
    | "attemptCount"
    | "nextAttemptAt"
    | "lockedUntil"
    | "providerContainerId"
    | "providerPostId"
    | "providerPermalink"
    | "lastError"
    | "lastErrorCode"
    | "publishedAt"
  >
> & { providerResponse?: Record<string, unknown> | null };

export interface PostPublishingPatch {
  status?: PostStatus;
  approvedAt?: string | null;
  approvedBy?: ID | null;
  publishedAt?: string | null;
  providerPostId?: string | null;
  permalink?: string | null;
  error?: string | null;
}

export type NewMediaAsset = Omit<MediaAsset, "id" | "createdAt" | "status"> & { status?: MediaAsset["status"] };

export type NewSnapshot = Omit<MetricSnapshot, "id">;

export type NewReview = Omit<PerformanceReview, "id" | "createdAt">;

export interface SocialStore {
  readonly privileged: boolean;

  // connection (public columns on social_accounts)
  updateConnection(organizationId: ID, accountId: ID, patch: ConnectionPatch): Promise<void>;
  findAccountIdByExternalId(organizationId: ID, platform: PublishablePlatform, externalAccountId: string): Promise<ID | null>;
  getOrganizationMeta(organizationId: ID): Promise<{ isDemo: boolean; timezone: string } | null>;
  getAccountSummary(organizationId: ID, accountId: ID): Promise<AccountSummary | null>;

  // vault (system only)
  saveCredential(organizationId: ID, accountId: ID, provider: PublishablePlatform, externalAccountId: string, token: TokenSet): Promise<void>;
  getCredential(organizationId: ID, accountId: ID): Promise<StoredCredential | null>;
  markRefreshFailure(organizationId: ID, accountId: ID): Promise<number>;
  deleteCredential(organizationId: ID, accountId: ID): Promise<void>;
  deleteCredentialsByExternalId(provider: PublishablePlatform, externalAccountId: string): Promise<{ organizationId: ID; socialAccountId: ID }[]>;
  systemListCredentialsExpiringBefore(before: string): Promise<{ organizationId: ID; socialAccountId: ID; provider: PublishablePlatform; tokenExpiresAt: string | null }[]>;
  createPending(input: Omit<PendingConnection, "id" | "expiresAt">): Promise<ID>;
  getPending(id: ID, organizationId: ID, userId: ID): Promise<PendingConnection | null>;
  consumePending(id: ID): Promise<void>;

  // media
  createMedia(input: NewMediaAsset): Promise<MediaAsset>;
  updateMedia(organizationId: ID, id: ID, patch: Partial<Pick<MediaAsset, "status" | "sizeBytes" | "width" | "height" | "durationMs" | "sortOrder" | "postId">>): Promise<MediaAsset>;
  listMedia(organizationId: ID, postId: ID): Promise<MediaAsset[]>;
  getMedia(organizationId: ID, id: ID): Promise<MediaAsset | null>;
  deleteMedia(organizationId: ID, id: ID): Promise<void>;

  // publish queue
  createJob(input: NewPublishJob): Promise<PublishJob>;
  getJob(organizationId: ID, id: ID): Promise<PublishJob | null>;
  listJobs(organizationId: ID, options?: { statuses?: PublishJobStatus[]; postId?: ID; limit?: number }): Promise<PublishJob[]>;
  updateJob(organizationId: ID, id: ID, patch: PublishJobPatch, expect?: { statuses: PublishJobStatus[] }): Promise<PublishJob | null>;
  /** Atomically claims due jobs (queued/retrying with next_attempt_at ≤ now, or publishing with an expired lock). */
  systemClaimDueJobs(now: Date, limit: number, lockSeconds: number, organizationId?: ID): Promise<PublishJob[]>;
  countPublishedSince(organizationId: ID, accountId: ID, since: string): Promise<number>;
  updatePostPublishing(organizationId: ID, postId: ID, patch: PostPublishingPatch): Promise<void>;
  /** Published jobs (for insights sync), newest first. */
  systemListPublishedJobs(publishedAfter: string, organizationId?: ID): Promise<PublishJob[]>;

  // insights
  addSnapshot(input: NewSnapshot): Promise<MetricSnapshot>;
  listSnapshots(organizationId: ID, options?: { postIds?: ID[]; accountId?: ID; scope?: "post" | "account"; since?: string }): Promise<MetricSnapshot[]>;

  // AI reviews & Marketing Memory
  addReview(input: NewReview): Promise<PerformanceReview>;
  listReviews(organizationId: ID, options?: { postId?: ID; limit?: number }): Promise<PerformanceReview[]>;
  addLearning(organizationId: ID, input: ContentLearningInput, createdBy: ID | null): Promise<ContentLearning>;
  listLearnings(organizationId: ID, options?: { status?: ContentLearning["status"] }): Promise<ContentLearning[]>;
  setLearningStatus(organizationId: ID, id: ID, status: ContentLearning["status"]): Promise<void>;

  // audit log
  logEvent(organizationId: ID, input: SocialEventInput): Promise<void>;
  listEvents(organizationId: ID, options?: { limit?: number; postId?: ID }): Promise<SocialEvent[]>;
}

export class SocialStoreError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "forbidden" | "conflict" | "unavailable" | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "SocialStoreError";
  }
}
