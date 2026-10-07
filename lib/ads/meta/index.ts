import "server-only";
import type { FetchLike } from "@/lib/social/http";
import type { AdsContext, AdsProvider, CreativeDraftInput } from "../provider";
import { metaAdsAuthorizationUrl, metaAdsConnect } from "./auth";
import { metaSyncAdSets, metaSyncAds, metaSyncCampaigns, metaSyncCreatives } from "./campaigns";
import type { MetaAdsAppConfig } from "./config";
import { metaCreateCreative, metaPreview } from "./creatives";
import { metaCreateAd, metaSetAdStatus } from "./experiments";
import { metaSyncInsights } from "./insights";

export interface MetaAdsAccountOptions {
  currency: string;
  pageId: string | null;
  instagramUserId: string | null;
}

export class MetaAdsProvider implements AdsProvider {
  readonly kind = "meta" as const;

  constructor(
    private readonly app: MetaAdsAppConfig,
    private readonly account: MetaAdsAccountOptions = { currency: "JPY", pageId: null, instagramUserId: null },
    private readonly fetchImpl?: FetchLike,
  ) {}

  getAuthorizationUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    return metaAdsAuthorizationUrl(this.app, state, redirectUri);
  }
  connect({ code, redirectUri }: { code: string; redirectUri: string }) {
    return metaAdsConnect(this.app, code, redirectUri, this.fetchImpl);
  }
  syncCampaigns(ctx: AdsContext) {
    return metaSyncCampaigns({ ...ctx, currency: this.account.currency }, this.fetchImpl);
  }
  syncAdSets(ctx: AdsContext) {
    return metaSyncAdSets({ ...ctx, currency: this.account.currency }, this.fetchImpl);
  }
  syncAds(ctx: AdsContext) {
    return metaSyncAds(ctx, this.fetchImpl);
  }
  syncCreatives(ctx: AdsContext) {
    return metaSyncCreatives(ctx, this.fetchImpl);
  }
  syncInsights(ctx: AdsContext, params: Parameters<AdsProvider["syncInsights"]>[1]) {
    return metaSyncInsights(ctx, params, this.fetchImpl);
  }
  createCreativeDraft(ctx: AdsContext, input: CreativeDraftInput) {
    return metaCreateCreative({ ...ctx, pageId: this.account.pageId ?? this.app.defaultPageId, instagramUserId: this.account.instagramUserId ?? this.app.defaultInstagramUserId }, input, this.fetchImpl);
  }
  createAdDraft(ctx: AdsContext, input: Parameters<AdsProvider["createAdDraft"]>[1]) {
    return metaCreateAd(ctx, input, this.fetchImpl);
  }
  async createExperiment(ctx: AdsContext, input: Parameters<AdsProvider["createExperiment"]>[1]) {
    const out: { label: string; externalAdId: string }[] = [];
    for (const v of input.variants) {
      const ad = await metaCreateAd(ctx, { adSetExternalId: input.adSetExternalId, creativeExternalId: v.creativeExternalId, name: v.name, status: input.start ? "ACTIVE" : "PAUSED" }, this.fetchImpl);
      out.push({ label: v.label, externalAdId: ad.externalId });
    }
    return out;
  }
  pauseAd(ctx: AdsContext, adExternalId: string) {
    return metaSetAdStatus(ctx, adExternalId, "PAUSED", this.fetchImpl);
  }
  activateAd(ctx: AdsContext, adExternalId: string) {
    return metaSetAdStatus(ctx, adExternalId, "ACTIVE", this.fetchImpl);
  }
  getPreview(ctx: AdsContext, creativeExternalId: string, format: string) {
    return metaPreview(ctx, creativeExternalId, format, this.fetchImpl);
  }
}
