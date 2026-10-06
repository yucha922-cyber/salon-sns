import "server-only";
import { INSTAGRAM_API, REQUIRED_SCOPES, type MetaAppConfig } from "../config";
import type { FetchLike } from "../http";
import type { ConnectResult, TokenSet } from "../types";
import { instagramGraph, instagramOAuthHost, instagramTokenHost } from "./client";
import { toCandidate, type IgProfile } from "./mapper";

/**
 * Instagram Login OAuth:
 *   authorize  www.instagram.com/oauth/authorize (client_id = Instagram App ID)
 *   exchange   POST api.instagram.com/oauth/access_token  → short-lived (1h)
 *   long-lived GET graph.instagram.com/access_token?grant_type=ig_exchange_token → 60 days
 *   refresh    GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token
 */
export function instagramAuthorizationUrl(app: MetaAppConfig, state: string, redirectUri: string): string {
  const url = new URL(INSTAGRAM_API.authorizeUrl);
  url.search = new URLSearchParams({
    client_id: app.appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: REQUIRED_SCOPES.instagram.join(","),
    state,
    // Never silently reuse a different logged-in account: avoids connecting the wrong store.
    force_reauth: "true",
  }).toString();
  return url.toString();
}

const expiresAt = (seconds: number | undefined) => (seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null);

export async function instagramConnect(app: MetaAppConfig, code: string, redirectUri: string, fetchImpl?: FetchLike): Promise<ConnectResult> {
  // Instagram appends "#_" to the redirect; it is not part of the code.
  const cleanCode = code.replace(/#_$/, "");
  const short = await instagramOAuthHost(fetchImpl).post<{ access_token: string; user_id?: number | string; permissions?: string[] | string }>(
    "/oauth/access_token",
    { client_id: app.appId, client_secret: app.appSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code: cleanCode },
    "instagram.exchange_code",
  );
  const long = await instagramTokenHost(fetchImpl).get<{ access_token: string; expires_in?: number }>(
    "/access_token",
    { grant_type: "ig_exchange_token", client_secret: app.appSecret, access_token: short.access_token },
    "instagram.long_lived_token",
  );
  const profile = await instagramGraph(fetchImpl).get<IgProfile>(
    "/me",
    { fields: "user_id,username,name,account_type,profile_picture_url,followers_count,media_count", access_token: long.access_token },
    "instagram.profile",
  );
  const granted = Array.isArray(short.permissions) ? short.permissions : (short.permissions ?? "").split(",").filter(Boolean);
  return {
    token: { accessToken: long.access_token, expiresAt: expiresAt(long.expires_in), scopes: granted.length ? granted : REQUIRED_SCOPES.instagram },
    candidates: [toCandidate(profile)],
  };
}

export async function instagramRefresh(token: TokenSet, fetchImpl?: FetchLike): Promise<TokenSet> {
  const refreshed = await instagramTokenHost(fetchImpl).get<{ access_token: string; expires_in?: number }>(
    "/refresh_access_token",
    { grant_type: "ig_refresh_token", access_token: token.accessToken },
    "instagram.refresh_token",
  );
  return { accessToken: refreshed.access_token, expiresAt: expiresAt(refreshed.expires_in), scopes: token.scopes };
}
