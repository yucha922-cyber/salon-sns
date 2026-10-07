/**
 * Social publishing domain types (provider-independent).
 * UI / services only use these; Instagram / Threads specifics stay inside
 * lib/social/instagram and lib/social/threads.
 */
import type { AccountGoal, ID, SocialPlatform } from "@/lib/domain/types";

/** Platforms that can actually be connected & published to in this release. */
export const PUBLISHABLE_PLATFORMS = ["instagram", "threads"] as const;
export type PublishablePlatform = (typeof PUBLISHABLE_PLATFORMS)[number];

export function isPublishablePlatform(p: SocialPlatform): p is PublishablePlatform {
  return (PUBLISHABLE_PLATFORMS as readonly string[]).includes(p);
}

export const CONNECTION_STATUSES = [
  "manual",
  "connected",
  "expired",
  "error",
  "disconnected",
  "reauthorization_required",
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** Public (non-secret) connection info. Tokens never appear in this type. */
export interface SocialConnectionInfo {
  status: ConnectionStatus;
  externalAccountId: string | null;
  username: string;
  profileImageUrl: string | null;
  tokenExpiresAt: string | null;
  scopes: string[];
  connectedAt: string | null;
  lastSyncedAt: string | null;
  error: string | null;
  /** account_type, followers_count, ... (provider data that is safe to show) */
  metadata: Record<string, string | number | boolean | null>;
}

/** Badge shown in the UI, derived from status + expiry. */
export type ConnectionBadge = "connected" | "expiring" | "reconnect" | "error" | "disconnected" | "not_connected";

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export interface TokenSet {
  accessToken: string;
  /** null = provider did not say (treated as unknown) */
  expiresAt: string | null;
  scopes: string[];
}

export interface AccountCandidate {
  externalAccountId: string;
  username: string;
  displayName: string;
  profileImageUrl: string | null;
  metadata: Record<string, string | number | boolean | null>;
}

export interface ConnectResult {
  token: TokenSet;
  candidates: AccountCandidate[];
}

// ---------------------------------------------------------------------------
// Content / media / validation
// ---------------------------------------------------------------------------

export type MediaKind = "image" | "video";

export interface MediaAsset {
  id: ID;
  organizationId: ID;
  locationId: ID | null;
  postId: ID | null;
  storagePath: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  status: "pending" | "ready" | "failed";
  sortOrder: number;
  createdAt: string;
}

/** Media as seen by a provider at publish time (URL must be fetchable by Meta). */
export interface PublishMedia {
  id: ID;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  url: string;
}

/** Normalized publish formats. Unsupported ones are rejected by validation. */
export type PublishFormat =
  | "IG_IMAGE"
  | "IG_CAROUSEL"
  | "IG_REEL"
  | "THREADS_TEXT"
  | "THREADS_IMAGE"
  | "THREADS_VIDEO"
  | "THREADS_CAROUSEL";

/** Exactly what the human approved; stored on the publish job and published verbatim. */
export interface ContentSnapshot {
  text: string;
  mediaIds: ID[];
  contentType: string;
  format: PublishFormat;
  title: string;
}

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: ValidationSeverity;
  /** stable code for tests / analytics */
  code: string;
  /** what is wrong (Japanese, user-facing) */
  message: string;
  /** how to fix it (Japanese, user-facing) */
  fix: string;
}

export interface ValidationResult {
  ok: boolean;
  format: PublishFormat | null;
  issues: ValidationIssue[];
  /** final text that will be sent (caption + CTA + hashtags) */
  text: string;
}

export interface ValidationInput {
  platform: PublishablePlatform;
  contentType: string;
  caption: string;
  cta: string;
  hashtags: string[];
  media: Pick<MediaAsset, "kind" | "mimeType" | "sizeBytes" | "width" | "height" | "durationMs">[];
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export const PUBLISH_JOB_STATUSES = ["queued", "publishing", "retrying", "published", "failed", "cancelled"] as const;
export type PublishJobStatus = (typeof PUBLISH_JOB_STATUSES)[number];

export interface PublishJob {
  id: ID;
  organizationId: ID;
  locationId: ID | null;
  socialAccountId: ID;
  postId: ID;
  provider: PublishablePlatform;
  format: PublishFormat;
  mode: "scheduled" | "immediate";
  scheduledAt: string;
  status: PublishJobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lockedUntil: string | null;
  content: ContentSnapshot;
  providerContainerId: string | null;
  providerPostId: string | null;
  providerPermalink: string | null;
  lastError: string | null;
  lastErrorCode: string | null;
  publishedAt: string | null;
  requestedBy: ID | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishRequest {
  externalAccountId: string;
  accessToken: string;
  format: PublishFormat;
  text: string;
  media: PublishMedia[];
  /** set when resuming a job whose container was already created */
  containerId: string | null;
  /**
   * Called as soon as the (parent) container exists, BEFORE publishing, so a
   * crash between "publish" and "save result" resumes with the container id
   * (and is recovered via its PUBLISHED status) instead of posting twice.
   */
  onContainerCreated?: (containerId: string) => Promise<void>;
}

/** A publish call either finishes, or needs another tick (media still processing). */
export type PublishOutcome =
  | { state: "published"; providerPostId: string; permalink: string | null; response: Record<string, unknown> }
  | { state: "processing"; containerId: string; response: Record<string, unknown> };

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

/** Common metric layer. Missing = not provided by the platform (never invented). */
export interface NormalizedMetrics {
  impressions?: number;
  reach?: number;
  views?: number;
  engagements?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
  follows?: number;
  profileVisits?: number;
  conversions?: number;
  followers?: number;
  /** provider-specific metrics kept under their own names (e.g. quotes, reposts, avg_watch_time) */
  platformSpecific?: Record<string, number>;
}

export const NORMALIZED_METRIC_KEYS = [
  "impressions",
  "reach",
  "views",
  "engagements",
  "likes",
  "comments",
  "shares",
  "saves",
  "clicks",
  "follows",
  "profileVisits",
  "conversions",
  "followers",
] as const;
export type NormalizedMetricKey = (typeof NORMALIZED_METRIC_KEYS)[number];

export interface InsightsResult {
  metrics: NormalizedMetrics;
  raw: Record<string, unknown>;
}

export interface MetricSnapshot {
  id: ID;
  organizationId: ID;
  locationId: ID | null;
  socialAccountId: ID;
  postId: ID | null;
  provider: PublishablePlatform;
  scope: "post" | "account";
  providerPostId: string | null;
  capturedAt: string;
  hoursSincePublish: number | null;
  metrics: NormalizedMetrics;
}

// ---------------------------------------------------------------------------
// AI performance review / Marketing Memory / event log
// ---------------------------------------------------------------------------

export interface PerformanceReview {
  id: ID;
  organizationId: ID;
  locationId: ID | null;
  socialAccountId: ID | null;
  postId: ID;
  snapshotId: ID | null;
  summary: string;
  whatWorked: string[];
  whatDidNotWork: string[];
  possibleReasons: string[];
  keyLearning: string;
  recommendedNextAction: string;
  nextCreativeHypothesis: string;
  confidence: number;
  aiProvider: string | null;
  createdAt: string;
}

export interface ContentLearningInput {
  locationId: ID | null;
  socialAccountId: ID | null;
  platform: SocialPlatform | null;
  goal: AccountGoal | null;
  contentPillar: string;
  hypothesis: string;
  result: string;
  learning: string;
  confidence: number;
  validFrom: string; // YYYY-MM-DD
  validUntil: string | null;
  sourcePostIds: ID[];
  sourceReviewId: ID | null;
  /** content = organic SNS (Marketing Memory), creative = ad creative tests (Creative Memory) */
  kind?: "content" | "creative";
  /** structured pattern (persona / hook / angle / variable / winningPattern / why …) */
  attributes?: Record<string, string | undefined>;
  sourceExperimentId?: ID | null;
}

export interface ContentLearning extends ContentLearningInput {
  id: ID;
  organizationId: ID;
  status: "active" | "archived";
  createdAt: string;
}

export const SOCIAL_EVENT_TYPES = [
  "account_connected",
  "account_disconnected",
  "account_reauthorization_required",
  "token_refreshed",
  "token_refresh_failed",
  "post_approved",
  "publish_queued",
  "publish_cancelled",
  "publish_started",
  "publish_success",
  "publish_failed",
  "publish_retry_scheduled",
  "insights_synced",
  "insights_failed",
  "review_generated",
  "learning_saved",
  "recommendation_generated",
  "recommendation_approved",
  "recommendation_rejected",
  "webhook_received",
  // ad optimization loop (lib/ads)
  "ad_account_connected",
  "ad_account_disconnected",
  "ads_synced",
  "ads_sync_failed",
  "ad_analysis_generated",
  "hypothesis_generated",
  "hypothesis_accepted",
  "hypothesis_rejected",
  "creative_draft_generated",
  "creative_approved",
  "creative_rejected",
  "creative_edited",
  "experiment_created",
  "experiment_approved",
  "experiment_started",
  "experiment_completed",
  "experiment_cancelled",
  "winner_selected",
  "ad_paused",
  "ad_activated",
  "conversions_recorded",
] as const;
export type SocialEventType = (typeof SOCIAL_EVENT_TYPES)[number];

export interface SocialEventInput {
  type: SocialEventType;
  level?: "info" | "warn" | "error";
  message: string;
  locationId?: ID | null;
  socialAccountId?: ID | null;
  postId?: ID | null;
  publishJobId?: ID | null;
  details?: Record<string, string | number | boolean | null>;
  actorUserId?: ID | null;
}

export interface SocialEvent extends Required<Omit<SocialEventInput, "details" | "level">> {
  id: ID;
  organizationId: ID;
  level: "info" | "warn" | "error";
  details: Record<string, string | number | boolean | null>;
  createdAt: string;
}
