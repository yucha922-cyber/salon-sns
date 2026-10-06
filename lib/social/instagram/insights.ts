import "server-only";
import { SocialApiError } from "../errors";
import type { FetchLike } from "../http";
import type { InsightsResult, PublishFormat } from "../types";
import { instagramGraph } from "./client";
import { insightValues, normalizeInstagramAccount, normalizeInstagramMedia, type GraphInsightsResponse } from "./mapper";

/**
 * Media insights (Graph v22+ metric set; impressions / plays / video_views are
 * deprecated and never requested). If Meta rejects a metric for a media type
 * (code 100), we retry once with the core set instead of failing the sync.
 */
const FEED_METRICS = ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions", "follows", "profile_visits"];
const REEL_METRICS = ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions", "ig_reels_avg_watch_time"];
const CORE_METRICS = ["reach", "likes", "comments", "shares", "saved"];

export async function instagramPostInsights(token: string, mediaId: string, format: PublishFormat, fetchImpl?: FetchLike): Promise<InsightsResult> {
  const graph = instagramGraph(fetchImpl);
  const metrics = format === "IG_REEL" ? REEL_METRICS : FEED_METRICS;
  let res: GraphInsightsResponse;
  try {
    res = await graph.get<GraphInsightsResponse>(`/${mediaId}/insights`, { metric: metrics.join(","), access_token: token }, "instagram.media_insights");
  } catch (error) {
    if (!(error instanceof SocialApiError) || error.kind !== "invalid_content") throw error;
    res = await graph.get<GraphInsightsResponse>(`/${mediaId}/insights`, { metric: CORE_METRICS.join(","), access_token: token }, "instagram.media_insights_core");
  }
  const values = insightValues(res);
  return { metrics: normalizeInstagramMedia(values), raw: values };
}

export async function instagramAccountInsights(token: string, userId: string, since: Date, until: Date, fetchImpl?: FetchLike): Promise<InsightsResult> {
  const graph = instagramGraph(fetchImpl);
  const res = await graph.get<GraphInsightsResponse>(
    `/${userId}/insights`,
    {
      metric: "reach,views,total_interactions,accounts_engaged,profile_links_taps",
      period: "day",
      metric_type: "total_value",
      since: String(Math.floor(since.getTime() / 1000)),
      until: String(Math.floor(until.getTime() / 1000)),
      access_token: token,
    },
    "instagram.account_insights",
  );
  const profile = await graph.get<{ followers_count?: number }>(`/me`, { fields: "followers_count", access_token: token }, "instagram.followers");
  const values = insightValues(res);
  return { metrics: normalizeInstagramAccount(values, profile.followers_count), raw: { ...values, followers_count: profile.followers_count ?? null } };
}
