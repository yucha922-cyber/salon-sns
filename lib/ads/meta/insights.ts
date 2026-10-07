import "server-only";
import type { FetchLike } from "@/lib/social/http";
import type { AdsContext, ProviderInsightRow } from "../provider";
import { getAll, metaGraph } from "./client";
import { mapInsightRow, type MetaInsightRow } from "./mapper";

/**
 * GET /act_{id}/insights level=…, time_increment=1 (daily), time_range.
 * Only currently supported fields; no deprecated attribution windows.
 * For very large accounts switch to async report runs (README: technical debt).
 */
export async function metaSyncInsights(
  ctx: AdsContext,
  params: { level: ProviderInsightRow["level"]; since: string; until: string; conversionActionTypes: (campaignExternalId: string) => string[] },
  fetchImpl?: FetchLike,
): Promise<ProviderInsightRow[]> {
  const idField = { account: "account_id", campaign: "campaign_id", adset: "adset_id", ad: "ad_id" }[params.level];
  const fields = ["date_start", "date_stop", "account_id", "campaign_id", idField, "spend", "impressions", "reach", "frequency", "inline_link_clicks", "actions", "action_values", "video_thruplay_watched_actions"];
  const rows = await getAll<MetaInsightRow>(
    metaGraph(fetchImpl),
    `/${ctx.accountExternalId}/insights`,
    {
      level: params.level,
      time_increment: "1",
      time_range: JSON.stringify({ since: params.since, until: params.until }),
      fields: [...new Set(fields)].join(","),
      limit: "500",
      access_token: ctx.accessToken,
    },
    "meta_ads.insights",
    50,
  );
  return rows.map((r) => {
    const rawId = (r as unknown as Record<string, string | undefined>)[idField] ?? "";
    const externalId = params.level === "account" ? (rawId.startsWith("act_") ? rawId : `act_${rawId}`) : rawId;
    const { metrics, raw } = mapInsightRow(r, params.level === "account" ? params.conversionActionTypes("") : params.conversionActionTypes(r.campaign_id ?? ""));
    return { level: params.level, externalId, date: r.date_start, dateStop: r.date_stop, metrics, raw };
  });
}
