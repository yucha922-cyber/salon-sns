/**
 * AdsProvider: the only surface services use to talk to an ad platform.
 * Meta specifics (Marketing API fields, action types, Insights params) stay
 * in lib/ads/meta; UI never imports a provider.
 *
 * Deliberately NOT part of this interface: budget changes, targeting
 * changes, campaign deletion. The MVP never performs them; humans do that in
 * Ads Manager. pause/activate exist only behind an explicit human approval
 * (lib/ads/actions.ts records who approved).
 */
import type { AdDailyMetrics } from "./types";

export interface AdsContext {
  accessToken: string;
  accountExternalId: string; // act_<id>
}

export interface ProviderAdAccount {
  externalAccountId: string;
  name: string;
  currency: string;
  timezone: string;
  accountStatus: string;
  businessId: string | null;
  businessName: string | null;
}

export interface ProviderCampaign {
  externalId: string;
  name: string;
  objective: string | null;
  status: string;
  effectiveStatus: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  specialAdCategories: string[];
  startTime: string | null;
  stopTime: string | null;
  raw: Record<string, unknown>;
}

export interface ProviderAdSet {
  externalId: string;
  campaignExternalId: string;
  name: string;
  status: string;
  effectiveStatus: string | null;
  optimizationGoal: string | null;
  billingEvent: string | null;
  dailyBudget: number | null;
  targeting: Record<string, unknown> | null;
  promotedObject: Record<string, unknown> | null;
}

export interface ProviderAd {
  externalId: string;
  adSetExternalId: string;
  campaignExternalId: string;
  creativeExternalId: string | null;
  name: string;
  status: string;
  effectiveStatus: string | null;
  createdTime: string | null;
  landingPageUrl: string | null;
  reviewFeedback: Record<string, unknown> | null;
}

export interface ProviderCreative {
  externalId: string;
  name: string;
  title: string;
  body: string;
  callToActionType: string | null;
  linkUrl: string | null;
  thumbnailUrl: string | null;
  format: "image" | "video" | "carousel" | "unknown";
}

export interface ProviderInsightRow {
  level: "account" | "campaign" | "adset" | "ad";
  externalId: string;
  date: string; // date_start
  dateStop: string;
  metrics: AdDailyMetrics;
  raw: Record<string, number>;
}

export interface CreativeDraftInput {
  name: string;
  pageId: string | null;
  headline: string;
  primaryText: string;
  description: string;
  callToActionType: string;
  linkUrl: string;
  imageUrl: string | null;
}

export interface AdsProvider {
  readonly kind: "meta" | "mock";
  getAuthorizationUrl(params: { state: string; redirectUri: string }): string;
  /** OAuth code → long-lived token + ad accounts the user can access. */
  connect(params: { code: string; redirectUri: string }): Promise<{ accessToken: string; expiresAt: string | null; scopes: string[]; accounts: ProviderAdAccount[] }>;
  syncCampaigns(ctx: AdsContext): Promise<ProviderCampaign[]>;
  syncAdSets(ctx: AdsContext): Promise<ProviderAdSet[]>;
  syncAds(ctx: AdsContext): Promise<ProviderAd[]>;
  syncCreatives(ctx: AdsContext): Promise<ProviderCreative[]>;
  /** Daily rows (time_increment=1). conversionActionTypes = which actions count as "the CV" per campaign. */
  syncInsights(ctx: AdsContext, params: { level: ProviderInsightRow["level"]; since: string; until: string; conversionActionTypes: (campaignExternalId: string) => string[] }): Promise<ProviderInsightRow[]>;
  /** Creates the creative object only (no delivery). */
  createCreativeDraft(ctx: AdsContext, input: CreativeDraftInput): Promise<{ externalId: string }>;
  /** Creates an ad in the given ad set. Always created PAUSED unless the human chose to start it. */
  createAdDraft(ctx: AdsContext, input: { adSetExternalId: string; creativeExternalId: string; name: string; status: "PAUSED" | "ACTIVE" }): Promise<{ externalId: string }>;
  /** A/B creative test = one ad per variant in the same ad set (budget / targeting untouched). */
  createExperiment(ctx: AdsContext, input: { adSetExternalId: string; variants: { label: string; creativeExternalId: string; name: string }[]; start: boolean }): Promise<{ label: string; externalAdId: string }[]>;
  pauseAd(ctx: AdsContext, adExternalId: string): Promise<void>;
  activateAd(ctx: AdsContext, adExternalId: string): Promise<void>;
  getPreview(ctx: AdsContext, creativeExternalId: string, format: string): Promise<{ html: string | null }>;
}
