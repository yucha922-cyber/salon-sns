import type { ID } from "@/lib/domain/types";
import type {
  AdAccount,
  AdCampaign,
  AdCreativeRecord,
  AdMetricSnapshot,
  AdRecord,
  AdSetRecord,
  AiAdAnalysis,
  CreativeHypothesis,
  Experiment,
  ExperimentVariant,
  FirstPartyConversion,
} from "./types";

/**
 * Storage boundary for the ad optimization loop. Same privilege model as
 * lib/social/store.ts: pages read with the user's client (RLS incl. location
 * scope); every write runs with the service role AFTER lib/ads/access.ts
 * checked the user's permission (or in the background worker).
 * Credential methods only work on privileged stores.
 */
export type NewAdAccount = Omit<AdAccount, "id">;
export type SyncedCampaign = Omit<AdCampaign, "id" | "organizationId" | "goal" | "landingPageUrl" | "locationId" | "conversionEvent"> & {
  goal?: AdCampaign["goal"];
  landingPageUrl?: string | null;
  locationId?: ID | null;
  conversionEvent?: string | null;
};
export type SyncedAdSet = Omit<AdSetRecord, "id" | "organizationId" | "campaignId" | "audienceLabel"> & { campaignExternalId: string; audienceLabel?: string };
export type SyncedAd = Omit<AdRecord, "id" | "organizationId" | "campaignId" | "adSetId" | "creativeId" | "locationId"> & {
  campaignExternalId: string;
  adSetExternalId: string;
  creativeExternalId: string | null;
};
export type NewCreative = Omit<AdCreativeRecord, "id" | "createdAt">;
export type CreativePatch = Partial<Omit<AdCreativeRecord, "id" | "organizationId" | "createdAt">>;
export type NewSnapshot = Omit<AdMetricSnapshot, "id" | "capturedAt">;
export type NewHypothesis = Omit<CreativeHypothesis, "id" | "createdAt" | "decidedBy" | "decidedAt" | "status"> & { status?: CreativeHypothesis["status"] };
export type NewExperiment = Omit<Experiment, "id" | "createdAt" | "variants" | "controlVariantId" | "decision" | "winnerVariantId" | "resultSummary" | "approvedBy" | "approvedAt" | "launchedBy" | "launchedAt" | "completedBy" | "completedAt"> & {
  variants: Omit<ExperimentVariant, "id" | "organizationId" | "experimentId" | "decision" | "metricsUpdatedAt">[];
};
export type ExperimentPatch = Partial<
  Pick<Experiment, "status" | "decision" | "winnerVariantId" | "resultSummary" | "startDate" | "endDate" | "approvedBy" | "approvedAt" | "launchedBy" | "launchedAt" | "completedBy" | "completedAt" | "criteria" | "name">
>;
export type VariantPatch = Partial<Omit<ExperimentVariant, "id" | "organizationId" | "experimentId" | "role" | "label">>;

export interface AdsStore {
  readonly privileged: boolean;

  // accounts & credentials
  listAdAccounts(organizationId: ID): Promise<AdAccount[]>;
  upsertAdAccount(input: NewAdAccount): Promise<AdAccount>;
  updateAdAccount(organizationId: ID, id: ID, patch: Partial<Omit<AdAccount, "id" | "organizationId">>): Promise<void>;
  saveAdCredential(organizationId: ID, adAccountId: ID, token: { accessToken: string; expiresAt: string | null; scopes: string[] }): Promise<void>;
  getAdCredential(organizationId: ID, adAccountId: ID): Promise<{ accessToken: string; expiresAt: string | null; scopes: string[] } | null>;
  deleteAdCredential(organizationId: ID, adAccountId: ID): Promise<void>;
  systemListAdAccounts(): Promise<AdAccount[]>;
  getOrganizationIsDemo(organizationId: ID): Promise<boolean>;

  // structure (sync = upsert by external id)
  upsertCampaigns(organizationId: ID, adAccountId: ID, rows: SyncedCampaign[]): Promise<Map<string, ID>>;
  upsertAdSets(organizationId: ID, rows: SyncedAdSet[], campaignIds: Map<string, ID>): Promise<Map<string, ID>>;
  upsertSyncedCreatives(organizationId: ID, adAccountId: ID, rows: NewCreative[]): Promise<Map<string, ID>>;
  upsertAds(organizationId: ID, rows: SyncedAd[], ids: { campaigns: Map<string, ID>; adSets: Map<string, ID>; creatives: Map<string, ID> }): Promise<Map<string, ID>>;
  listCampaigns(organizationId: ID): Promise<AdCampaign[]>;
  updateCampaign(organizationId: ID, id: ID, patch: Partial<Pick<AdCampaign, "goal" | "landingPageUrl" | "locationId" | "conversionEvent">>): Promise<void>;
  listAdSets(organizationId: ID): Promise<AdSetRecord[]>;
  listAds(organizationId: ID): Promise<AdRecord[]>;
  updateAd(organizationId: ID, id: ID, patch: Partial<Pick<AdRecord, "status" | "effectiveStatus" | "landingPageUrl">>): Promise<void>;
  createAdRecord(organizationId: ID, input: Omit<AdRecord, "id" | "organizationId">): Promise<AdRecord>;

  // creatives (synced + drafts)
  listCreatives(organizationId: ID): Promise<AdCreativeRecord[]>;
  getCreative(organizationId: ID, id: ID): Promise<AdCreativeRecord | null>;
  createCreative(input: NewCreative): Promise<AdCreativeRecord>;
  updateCreative(organizationId: ID, id: ID, patch: CreativePatch): Promise<AdCreativeRecord>;

  // metrics & conversions
  upsertSnapshots(organizationId: ID, rows: NewSnapshot[]): Promise<number>;
  listSnapshots(organizationId: ID, options?: { entityType?: AdMetricSnapshot["entityType"]; entityIds?: ID[]; since?: string }): Promise<AdMetricSnapshot[]>;
  addConversions(organizationId: ID, rows: Omit<FirstPartyConversion, "id" | "organizationId" | "createdAt">[]): Promise<number>;
  listConversions(organizationId: ID, options?: { since?: string }): Promise<FirstPartyConversion[]>;

  // analyses, hypotheses, experiments
  addAnalysis(input: Omit<AiAdAnalysis, "id" | "createdAt">): Promise<AiAdAnalysis>;
  listAnalyses(organizationId: ID, limit?: number): Promise<AiAdAnalysis[]>;
  addHypotheses(rows: NewHypothesis[]): Promise<CreativeHypothesis[]>;
  listHypotheses(organizationId: ID): Promise<CreativeHypothesis[]>;
  updateHypothesis(organizationId: ID, id: ID, patch: Partial<Pick<CreativeHypothesis, "status" | "decidedBy" | "decidedAt">>): Promise<void>;
  createExperiment(input: NewExperiment): Promise<Experiment>;
  getExperiment(organizationId: ID, id: ID): Promise<Experiment | null>;
  listExperiments(organizationId: ID): Promise<Experiment[]>;
  /** Compare-and-set: returns null when the status (or launchedAt === null when notLaunched) no longer matches. */
  updateExperiment(organizationId: ID, id: ID, patch: ExperimentPatch, expect?: { statuses: Experiment["status"][]; notLaunched?: boolean }): Promise<Experiment | null>;
  updateVariant(organizationId: ID, variantId: ID, patch: VariantPatch): Promise<void>;
}

export class AdsStoreError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "forbidden" | "conflict" | "unavailable" | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "AdsStoreError";
  }
}
