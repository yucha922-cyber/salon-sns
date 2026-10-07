import "server-only";
import type { FetchLike } from "@/lib/social/http";
import type { AdsContext } from "../provider";
import { metaGraph } from "./client";

/**
 * Creative A/B test (MVP) = one ad per variant inside an EXISTING ad set,
 * created PAUSED unless the human chose "start now" at final confirmation.
 * Budget, targeting and the campaign are never touched. (Meta's native
 * split tests via /{business_id}/ad_studies need separate ad sets — future.)
 */
export async function metaCreateAd(ctx: AdsContext, input: { adSetExternalId: string; creativeExternalId: string; name: string; status: "PAUSED" | "ACTIVE" }, fetchImpl?: FetchLike) {
  const res = await metaGraph(fetchImpl).post<{ id: string }>(
    `/${ctx.accountExternalId}/ads`,
    { name: input.name, adset_id: input.adSetExternalId, creative: JSON.stringify({ creative_id: input.creativeExternalId }), status: input.status, access_token: ctx.accessToken },
    "meta_ads.create_ad",
  );
  return { externalId: res.id };
}

export async function metaSetAdStatus(ctx: AdsContext, adExternalId: string, status: "PAUSED" | "ACTIVE", fetchImpl?: FetchLike) {
  await metaGraph(fetchImpl).post<{ success?: boolean }>(`/${adExternalId}`, { status, access_token: ctx.accessToken }, "meta_ads.set_status");
}
