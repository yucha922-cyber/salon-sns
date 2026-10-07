import "server-only";
import { getDataMode } from "@/lib/env";
import { getAppUrl } from "@/lib/social/config";

/**
 * Meta Marketing API configuration (server only).
 * Version pinned in one place (v26.0 = latest as of 2026-10; v24 expired 2026-10-06).
 */
export const META_ADS_API = {
  graphBase: process.env.META_GRAPH_BASE_URL ?? "https://graph.facebook.com",
  dialogBase: process.env.META_DIALOG_BASE_URL ?? "https://www.facebook.com",
  version: process.env.META_GRAPH_API_VERSION ?? "v26.0",
};

/** ads_read = reporting, ads_management = creating paused ads / pausing after approval. */
export const META_ADS_SCOPES = ["ads_read", "ads_management", "business_management"];

export interface MetaAdsAppConfig {
  appId: string;
  appSecret: string;
  /** Facebook Login for Business configuration id (bundles permissions & token type) */
  configId: string | null;
  redirectUri: string;
  /** Page / IG identity used for creatives created by the app (can be overridden per ad account) */
  defaultPageId: string | null;
  defaultInstagramUserId: string | null;
}

export function getMetaAdsConfig(): MetaAdsAppConfig | null {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return null;
  return {
    appId,
    appSecret,
    configId: process.env.META_ADS_CONFIG_ID || null,
    redirectUri: process.env.META_ADS_REDIRECT_URI ?? `${getAppUrl()}/api/ads/callback`,
    defaultPageId: process.env.META_ADS_PAGE_ID || null,
    defaultInstagramUserId: process.env.META_ADS_INSTAGRAM_USER_ID || null,
  };
}

export function adsProviderKind(isDemoOrganization: boolean): "mock" | "meta" {
  if (process.env.ADS_PROVIDER_MODE === "mock" || process.env.SOCIAL_PROVIDER_MODE === "mock") return "mock";
  if (getDataMode() === "demo" || isDemoOrganization) return "mock";
  return "meta";
}

/** Currencies whose Marketing API amounts have no minor unit (offset 1); others are cents (offset 100). */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "CLP", "COP", "CRC", "HUF", "ISK", "IDR", "PYG", "TWD", "VND"]);
export function currencyOffset(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100;
}
