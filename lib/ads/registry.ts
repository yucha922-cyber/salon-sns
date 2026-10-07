import "server-only";
import { SocialApiError } from "@/lib/social/errors";
import { adsProviderKind, getMetaAdsConfig } from "./meta/config";
import { MetaAdsProvider } from "./meta";
import { MockAdsProvider } from "./mock";
import type { AdsProvider } from "./provider";
import type { AdAccount } from "./types";

/** Demo Mode / demo organizations → MockAdsProvider; everything else → Meta Marketing API. */
export function getAdsProvider(options: { isDemoOrganization: boolean; account?: Pick<AdAccount, "currency" | "metadata"> | null }): AdsProvider {
  if (adsProviderKind(options.isDemoOrganization) === "mock") return new MockAdsProvider();
  const app = getMetaAdsConfig();
  if (!app) throw new SocialApiError("not_configured", "META_APP_ID / META_APP_SECRET are not configured");
  const meta = options.account?.metadata ?? {};
  return new MetaAdsProvider(app, {
    currency: options.account?.currency ?? "JPY",
    pageId: typeof meta.page_id === "string" ? meta.page_id : null,
    instagramUserId: typeof meta.instagram_user_id === "string" ? meta.instagram_user_id : null,
  });
}

export function adsRedirectUri(isDemoOrganization: boolean): string {
  if (adsProviderKind(isDemoOrganization) === "mock") return "/api/ads/callback";
  return getMetaAdsConfig()?.redirectUri ?? "/api/ads/callback";
}
