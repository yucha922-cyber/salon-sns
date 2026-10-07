import "server-only";
import type { ID } from "@/lib/domain/types";
import { SocialApiError } from "@/lib/social/errors";
import { logAdsEvent } from "./events";
import { actionTypesFor } from "./meta/mapper";
import { addDays } from "./metrics";
import type { AdsProvider, ProviderAdSet, ProviderCampaign, ProviderInsightRow } from "./provider";
import type { AdsStore, NewSnapshot, SyncedCampaign } from "./store";
import type { AdAccount, AdGoal, EntityType } from "./types";

/**
 * Ad data sync (read-only on Meta):
 *   structure  campaigns → ad sets → creatives → ads (upsert by external id;
 *              human-owned fields such as goal / LP / location are kept)
 *   insights   daily rows (time_increment=1) for account / campaign / ad set / ad
 *              first sync: 30 days; afterwards the last 28 days are re-pulled
 *              because Meta restates recent days (attribution windows).
 * Snapshots are idempotent per (entity, date).
 */
export const INITIAL_SYNC_DAYS = 30;
export const RESYNC_DAYS = 28;

const PROMOTED_EVENT: Record<string, string> = {
  SCHEDULE: "Schedule",
  LEAD: "Lead",
  SUBMIT_APPLICATION: "SubmitApplication",
  CONTACT: "Contact",
  PURCHASE: "Purchase",
  COMPLETE_REGISTRATION: "CompleteRegistration",
};

export function conversionEventOf(campaign: ProviderCampaign, adSets: ProviderAdSet[]): string | null {
  const fromRaw = campaign.raw.conversion_event;
  if (typeof fromRaw === "string" && fromRaw) return fromRaw;
  for (const s of adSets.filter((x) => x.campaignExternalId === campaign.externalId)) {
    const po = s.promotedObject ?? {};
    if (typeof po.custom_conversion_id === "string") return `custom:${po.custom_conversion_id}`;
    const ev = typeof po.custom_event_type === "string" ? PROMOTED_EVENT[po.custom_event_type] : undefined;
    if (ev) return ev;
  }
  return null;
}

/** Recruitment = EMPLOYMENT special category or an application event. */
export function goalOf(campaign: ProviderCampaign, conversionEvent: string | null): AdGoal {
  return campaign.specialAdCategories.includes("EMPLOYMENT") || conversionEvent === "SubmitApplication" ? "recruitment" : "acquisition";
}

/** Human-readable audience summary for the AI ("女性 25-39歳 / 渋谷区 半径3km"). */
export function audienceLabelOf(targeting: Record<string, unknown> | null): string {
  if (!targeting) return "";
  if (typeof targeting.audience_label === "string") return targeting.audience_label;
  const parts: string[] = [];
  const genders = Array.isArray(targeting.genders) ? targeting.genders : [];
  if (genders.length === 1) parts.push(genders[0] === 2 ? "女性" : "男性");
  if (targeting.age_min || targeting.age_max) parts.push(`${targeting.age_min ?? 18}-${targeting.age_max ?? 65}歳`);
  const geo = targeting.geo_locations as { cities?: { name?: string }[]; custom_locations?: { radius?: number }[]; countries?: string[] } | undefined;
  if (geo?.cities?.length) parts.push(geo.cities.map((c) => c.name).filter(Boolean).join("・"));
  else if (geo?.custom_locations?.length) parts.push(`半径${geo.custom_locations[0]?.radius ?? "?"}km`);
  return parts.join(" / ");
}

/** Last complete day in the ad account's timezone. */
export function lastCompleteDay(timezone: string, now: Date = new Date()): string {
  let today: string;
  try {
    today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    today = now.toISOString().slice(0, 10);
  }
  return addDays(today, -1);
}

export interface AdsSyncSummary {
  campaigns: number;
  adSets: number;
  ads: number;
  creatives: number;
  snapshots: number;
  since: string;
  until: string;
}

export async function syncAdAccount(
  store: AdsStore,
  provider: AdsProvider,
  account: AdAccount,
  options: { now?: Date; days?: number; actorUserId?: ID | null; locationFor?: (c: ProviderCampaign) => ID | null } = {},
): Promise<AdsSyncSummary> {
  const credential = await store.getAdCredential(account.organizationId, account.id);
  if (!credential) throw new SocialApiError("permission", "ad account credential missing");
  const ctx = { accessToken: credential.accessToken, accountExternalId: account.externalAccountId };
  const org = account.organizationId;
  try {
    const [pCampaigns, pAdSets, pCreatives, pAds] = await Promise.all([provider.syncCampaigns(ctx), provider.syncAdSets(ctx), provider.syncCreatives(ctx), provider.syncAds(ctx)]);

    const synced: SyncedCampaign[] = pCampaigns.map((c) => {
      const conversionEvent = conversionEventOf(c, pAdSets);
      return {
        adAccountId: account.id,
        externalId: c.externalId,
        name: c.name,
        objective: c.objective,
        status: c.status,
        effectiveStatus: c.effectiveStatus,
        dailyBudget: c.dailyBudget,
        lifetimeBudget: c.lifetimeBudget,
        currency: account.currency,
        specialAdCategories: c.specialAdCategories,
        startTime: c.startTime,
        stopTime: c.stopTime,
        lastSyncedAt: new Date().toISOString(),
        goal: goalOf(c, conversionEvent),
        conversionEvent,
        landingPageUrl: typeof c.raw.landing_page_url === "string" ? c.raw.landing_page_url : null,
        locationId: options.locationFor?.(c) ?? account.locationId ?? null,
      };
    });
    const campaignIds = await store.upsertCampaigns(org, account.id, synced);
    const adSetIds = await store.upsertAdSets(
      org,
      pAdSets.map((s) => ({
        externalId: s.externalId,
        campaignExternalId: s.campaignExternalId,
        name: s.name,
        status: s.status,
        effectiveStatus: s.effectiveStatus,
        optimizationGoal: s.optimizationGoal,
        billingEvent: s.billingEvent,
        dailyBudget: s.dailyBudget,
        targeting: s.targeting,
        audienceLabel: audienceLabelOf(s.targeting),
        locationId: null,
      })),
      campaignIds,
    );
    const campaignGoal = new Map(synced.map((c) => [c.externalId as string, c.goal ?? "acquisition"]));
    const adCampaign = new Map(pAds.map((a) => [a.creativeExternalId, a.campaignExternalId]));
    const creativeIds = await store.upsertSyncedCreatives(
      org,
      account.id,
      pCreatives.map((c) => ({
        organizationId: org,
        adAccountId: account.id,
        locationId: null,
        externalId: c.externalId,
        source: "synced",
        goal: campaignGoal.get(adCampaign.get(c.externalId) ?? "") ?? null,
        status: "active",
        concept: c.name,
        headline: c.title,
        primaryText: c.body,
        cta: c.callToActionType ?? "",
        format: c.format,
        hook: c.title,
        angle: "",
        persona: "",
        painPoint: "",
        offer: "",
        firstViewCopy: "",
        visualDirection: "",
        videoScript: null,
        brief: null,
        thumbnailUrl: c.thumbnailUrl,
        landingPageUrl: c.linkUrl,
        hypothesisId: null,
        parentCreativeId: null,
        variableChanged: null,
        approvedBy: null,
        approvedAt: null,
        rejectedReason: null,
        aiProvider: null,
      })),
    );
    const adIds = await store.upsertAds(
      org,
      pAds.map((a) => ({
        externalId: a.externalId,
        campaignExternalId: a.campaignExternalId,
        adSetExternalId: a.adSetExternalId,
        creativeExternalId: a.creativeExternalId,
        name: a.name,
        status: a.status,
        effectiveStatus: a.effectiveStatus,
        landingPageUrl: a.landingPageUrl,
        providerCreatedAt: a.createdTime,
      })),
      { campaigns: campaignIds, adSets: adSetIds, creatives: creativeIds },
    );

    // ---- insights
    const until = lastCompleteDay(account.timezone, options.now);
    const days = options.days ?? (account.lastSyncedAt ? RESYNC_DAYS : INITIAL_SYNC_DAYS);
    const since = addDays(until, -(days - 1));
    const campaigns = await store.listCampaigns(org);
    const cvEvent = new Map(campaigns.map((c) => [c.externalId ?? "", c.conversionEvent]));
    const conversionActionTypes = (campaignExternalId: string) => actionTypesFor(cvEvent.get(campaignExternalId) ?? null);
    const [adSets, ads] = await Promise.all([store.listAdSets(org), store.listAds(org)]);
    const locationOf = new Map<string, ID | null>([
      ...campaigns.map((c) => [`campaign:${c.id}`, c.locationId] as const),
      ...adSets.map((s) => [`ad_set:${s.id}`, s.locationId] as const),
      ...ads.map((a) => [`ad:${a.id}`, a.locationId] as const),
    ]);
    const idMaps: Record<ProviderInsightRow["level"], { type: EntityType; ids: Map<string, ID> }> = {
      account: { type: "account", ids: new Map([[account.externalAccountId, account.id]]) },
      campaign: { type: "campaign", ids: campaignIds },
      adset: { type: "ad_set", ids: adSetIds },
      ad: { type: "ad", ids: adIds },
    };
    let snapshots = 0;
    for (const level of ["account", "campaign", "adset", "ad"] as const) {
      const rows = await provider.syncInsights(ctx, { level, since, until, conversionActionTypes });
      const { type, ids } = idMaps[level];
      const batch: NewSnapshot[] = [];
      for (const r of rows) {
        const entityId = ids.get(r.externalId);
        if (!entityId) continue;
        batch.push({
          ...r.metrics,
          organizationId: org,
          adAccountId: account.id,
          locationId: type === "account" ? account.locationId : (locationOf.get(`${type}:${entityId}`) ?? null),
          entityType: type,
          entityId,
          date: r.date,
          dateStop: r.dateStop,
          ctr: null,
          cpc: null,
          cpm: null,
          cvr: null,
          cpa: null,
          roas: null,
          rawMetrics: r.raw,
          source: provider.kind === "mock" ? "mock" : "provider",
        });
      }
      snapshots += await store.upsertSnapshots(org, batch);
    }

    await store.updateAdAccount(org, account.id, { lastSyncedAt: new Date().toISOString(), connectionStatus: "connected", connectionError: null });
    const summary = { campaigns: campaignIds.size, adSets: adSetIds.size, ads: adIds.size, creatives: creativeIds.size, snapshots, since, until };
    await logAdsEvent(org, {
      type: "ads_synced",
      message: `広告データを同期しました（${since}〜${until}、キャンペーン${summary.campaigns}・広告${summary.ads}・スナップショット${snapshots}件）`,
      locationId: account.locationId,
      details: { adAccountId: account.id, ...summary },
      actorUserId: options.actorUserId ?? null,
    });
    return summary;
  } catch (error) {
    const reauth = error instanceof SocialApiError && (error.kind === "token_expired" || error.kind === "permission");
    await store.updateAdAccount(org, account.id, {
      connectionStatus: reauth ? "reauthorization_required" : account.connectionStatus,
      connectionError: error instanceof SocialApiError ? error.userMessage : "同期に失敗しました",
    });
    await logAdsEvent(org, {
      type: "ads_sync_failed",
      level: "error",
      message: `広告データの同期に失敗しました: ${error instanceof SocialApiError ? error.userMessage : error instanceof Error ? error.message : "unknown"}`,
      locationId: account.locationId,
      details: { adAccountId: account.id },
      actorUserId: options.actorUserId ?? null,
    });
    throw error;
  }
}
