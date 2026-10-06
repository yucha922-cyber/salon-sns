/**
 * SocialProvider: the only surface services use to talk to a social network.
 * Instagram / Threads specifics (endpoints, container flow, metric names) stay
 * inside each implementation; UI never imports a provider.
 *
 * Scheduling is NOT delegated to the networks (neither API offers native
 * scheduling for our use): the Publish Queue (lib/social/publish-queue.ts)
 * owns schedulePost() and calls publishPost() when a job is due.
 */
import type {
  ConnectResult,
  InsightsResult,
  PublishFormat,
  PublishOutcome,
  PublishRequest,
  PublishablePlatform,
  TokenSet,
  ValidationInput,
  ValidationResult,
} from "./types";

export interface SocialProvider {
  readonly platform: PublishablePlatform;
  readonly kind: "meta" | "mock";
  readonly scopes: string[];

  /** Step 1 of OAuth: where to send the browser. */
  getAuthorizationUrl(params: { state: string; redirectUri: string }): string;
  /** Step 2: code → long-lived token + account candidates (profile info only). */
  connectAccount(params: { code: string; redirectUri: string }): Promise<ConnectResult>;
  /** Extends a long-lived token (allowed once it is ≥24h old and not expired). */
  refreshConnection(token: TokenSet): Promise<TokenSet>;
  /** Pre-flight check against the platform's current publishing rules. */
  validateContent(input: ValidationInput): ValidationResult;
  /** Creates (or resumes) the media container and publishes when ready. */
  publishPost(request: PublishRequest): Promise<PublishOutcome>;
  /** Container / post processing status (for diagnostics & resume). */
  getPostStatus(params: { accessToken: string; containerId: string }): Promise<{ status: string; detail: string | null }>;
  getPostInsights(params: { accessToken: string; providerPostId: string; format: PublishFormat }): Promise<InsightsResult>;
  getAccountInsights(params: { accessToken: string; externalAccountId: string; since: Date; until: Date }): Promise<InsightsResult>;
  /** Best-effort remote revoke; local credentials are always deleted by the caller. */
  disconnectAccount(params: { accessToken: string }): Promise<void>;
}
