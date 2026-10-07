import "server-only";
import type { FetchLike } from "@/lib/social/http";
import type { ProviderAdAccount } from "../provider";
import { getAll, metaGraph } from "./client";
import { META_ADS_API, META_ADS_SCOPES, type MetaAdsAppConfig } from "./config";

/**
 * Facebook Login for Business:
 *   www.facebook.com/{v}/dialog/oauth?client_id&redirect_uri&state&config_id&response_type=code
 *   code → GET /oauth/access_token (server side, app secret) → token
 *   user tokens are exchanged for a 60-day token (fb_exchange_token);
 *   Business Integration System User tokens may not expire — debug_token tells.
 * Falls back to `scope=` when no config_id is configured (development only).
 */
export function metaAdsAuthorizationUrl(app: MetaAdsAppConfig, state: string, redirectUri: string): string {
  const url = new URL(`${META_ADS_API.dialogBase}/${META_ADS_API.version}/dialog/oauth`);
  const params: Record<string, string> = { client_id: app.appId, redirect_uri: redirectUri, state, response_type: "code" };
  if (app.configId) Object.assign(params, { config_id: app.configId, override_default_response_type: "true" });
  else params.scope = META_ADS_SCOPES.join(",");
  url.search = new URLSearchParams(params).toString();
  return url.toString();
}

export async function metaAdsConnect(app: MetaAdsAppConfig, code: string, redirectUri: string, fetchImpl?: FetchLike) {
  const graph = metaGraph(fetchImpl);
  const short = await graph.get<{ access_token: string; expires_in?: number }>(
    "/oauth/access_token",
    { client_id: app.appId, client_secret: app.appSecret, redirect_uri: redirectUri, code },
    "meta_ads.exchange_code",
  );
  let token = short.access_token;
  let expiresIn = short.expires_in;
  try {
    const long = await graph.get<{ access_token: string; expires_in?: number }>(
      "/oauth/access_token",
      { grant_type: "fb_exchange_token", client_id: app.appId, client_secret: app.appSecret, fb_exchange_token: token },
      "meta_ads.long_lived",
    );
    token = long.access_token;
    expiresIn = long.expires_in;
  } catch {
    // system-user tokens from Login for Business cannot / need not be exchanged
  }
  let scopes = META_ADS_SCOPES;
  let expiresAt: string | null = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
  try {
    const dbg = await graph.get<{ data?: { scopes?: string[]; expires_at?: number } }>(
      "/debug_token",
      { input_token: token, access_token: `${app.appId}|${app.appSecret}` },
      "meta_ads.debug_token",
    );
    if (dbg.data?.scopes?.length) scopes = dbg.data.scopes;
    if (dbg.data?.expires_at === 0) expiresAt = null; // never expires
    else if (dbg.data?.expires_at) expiresAt = new Date(dbg.data.expires_at * 1000).toISOString();
  } catch {
    // informational only
  }
  const rows = await getAll<{ id: string; name?: string; currency?: string; timezone_name?: string; account_status?: number; business?: { id: string; name?: string } }>(
    graph,
    "/me/adaccounts",
    { fields: "id,account_id,name,currency,timezone_name,account_status,business{id,name}", limit: "100", access_token: token },
    "meta_ads.adaccounts",
    5,
  );
  const accounts: ProviderAdAccount[] = rows.map((r) => ({
    externalAccountId: r.id.startsWith("act_") ? r.id : `act_${r.id}`,
    name: r.name ?? r.id,
    currency: r.currency ?? "JPY",
    timezone: r.timezone_name ?? "Asia/Tokyo",
    accountStatus: String(r.account_status ?? ""),
    businessId: r.business?.id ?? null,
    businessName: r.business?.name ?? null,
  }));
  return { accessToken: token, expiresAt, scopes, accounts };
}
