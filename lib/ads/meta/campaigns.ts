import "server-only";
import type { FetchLike } from "@/lib/social/http";
import type { AdsContext, ProviderAd, ProviderAdSet, ProviderCampaign, ProviderCreative } from "../provider";
import { getAll, metaGraph } from "./client";
import { currencyOffset } from "./config";

/** Read-only structure sync (campaigns / ad sets / ads / creatives). */
const money = (v: string | undefined, currency: string) => (v ? Number(v) / currencyOffset(currency) : null);

export async function metaSyncCampaigns(ctx: AdsContext & { currency: string }, fetchImpl?: FetchLike): Promise<ProviderCampaign[]> {
  const rows = await getAll<Record<string, unknown> & { id: string; name: string; objective?: string; status: string; effective_status?: string; daily_budget?: string; lifetime_budget?: string; special_ad_categories?: string[]; start_time?: string; stop_time?: string }>(
    metaGraph(fetchImpl),
    `/${ctx.accountExternalId}/campaigns`,
    { fields: "id,name,objective,status,effective_status,daily_budget,lifetime_budget,special_ad_categories,start_time,stop_time,bid_strategy,advantage_state_info", limit: "200", access_token: ctx.accessToken },
    "meta_ads.campaigns",
  );
  return rows.map((c) => ({
    externalId: c.id,
    name: c.name,
    objective: c.objective ?? null,
    status: c.status,
    effectiveStatus: c.effective_status ?? null,
    dailyBudget: money(c.daily_budget, ctx.currency),
    lifetimeBudget: money(c.lifetime_budget, ctx.currency),
    specialAdCategories: (c.special_ad_categories ?? []).filter((x) => x !== "NONE"),
    startTime: c.start_time ?? null,
    stopTime: c.stop_time ?? null,
    raw: { bid_strategy: c.bid_strategy ?? null, advantage_state_info: c.advantage_state_info ?? null },
  }));
}

export async function metaSyncAdSets(ctx: AdsContext & { currency: string }, fetchImpl?: FetchLike): Promise<ProviderAdSet[]> {
  const rows = await getAll<{ id: string; name: string; campaign_id: string; status: string; effective_status?: string; optimization_goal?: string; billing_event?: string; daily_budget?: string; targeting?: Record<string, unknown>; promoted_object?: Record<string, unknown> }>(
    metaGraph(fetchImpl),
    `/${ctx.accountExternalId}/adsets`,
    { fields: "id,name,campaign_id,status,effective_status,optimization_goal,billing_event,daily_budget,targeting,promoted_object", limit: "200", access_token: ctx.accessToken },
    "meta_ads.adsets",
  );
  return rows.map((s) => ({
    externalId: s.id,
    campaignExternalId: s.campaign_id,
    name: s.name,
    status: s.status,
    effectiveStatus: s.effective_status ?? null,
    optimizationGoal: s.optimization_goal ?? null,
    billingEvent: s.billing_event ?? null,
    dailyBudget: money(s.daily_budget, ctx.currency),
    targeting: s.targeting ?? null,
    promotedObject: s.promoted_object ?? null,
  }));
}

export async function metaSyncAds(ctx: AdsContext, fetchImpl?: FetchLike): Promise<ProviderAd[]> {
  const rows = await getAll<{ id: string; name: string; adset_id: string; campaign_id: string; creative?: { id: string }; status: string; effective_status?: string; created_time?: string; ad_review_feedback?: Record<string, unknown> }>(
    metaGraph(fetchImpl),
    `/${ctx.accountExternalId}/ads`,
    { fields: "id,name,adset_id,campaign_id,creative{id},status,effective_status,created_time,ad_review_feedback", limit: "200", access_token: ctx.accessToken },
    "meta_ads.ads",
  );
  return rows.map((a) => ({
    externalId: a.id,
    adSetExternalId: a.adset_id,
    campaignExternalId: a.campaign_id,
    creativeExternalId: a.creative?.id ?? null,
    name: a.name,
    status: a.status,
    effectiveStatus: a.effective_status ?? null,
    createdTime: a.created_time ?? null,
    landingPageUrl: null,
    reviewFeedback: a.ad_review_feedback ?? null,
  }));
}

export async function metaSyncCreatives(ctx: AdsContext, fetchImpl?: FetchLike): Promise<ProviderCreative[]> {
  const rows = await getAll<{ id: string; name?: string; title?: string; body?: string; call_to_action_type?: string; thumbnail_url?: string; link_url?: string; object_type?: string; video_id?: string; object_story_spec?: { link_data?: { link?: string; message?: string; name?: string }; video_data?: { message?: string; title?: string } } }>(
    metaGraph(fetchImpl),
    `/${ctx.accountExternalId}/adcreatives`,
    { fields: "id,name,title,body,call_to_action_type,thumbnail_url,link_url,object_type,video_id,object_story_spec", limit: "200", access_token: ctx.accessToken },
    "meta_ads.creatives",
  );
  return rows.map((c) => {
    const link = c.object_story_spec?.link_data;
    const video = c.object_story_spec?.video_data;
    return {
      externalId: c.id,
      name: c.name ?? c.id,
      title: c.title ?? link?.name ?? video?.title ?? "",
      body: c.body ?? link?.message ?? video?.message ?? "",
      callToActionType: c.call_to_action_type ?? null,
      linkUrl: c.link_url ?? link?.link ?? null,
      thumbnailUrl: c.thumbnail_url ?? null,
      format: c.video_id || video ? "video" : c.object_type === "SHARE" || link ? "image" : "unknown",
    };
  });
}
