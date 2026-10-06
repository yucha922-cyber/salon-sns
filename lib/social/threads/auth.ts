import "server-only";
import { REQUIRED_SCOPES, THREADS_API, type MetaAppConfig } from "../config";
import type { FetchLike } from "../http";
import type { ConnectResult, TokenSet } from "../types";
import { threadsGraph, threadsTokenHost } from "./client";
import { toThreadsCandidate, type ThreadsProfile } from "./mapper";

/**
 * Threads OAuth (uses the Threads App ID / secret from the "Access the Threads
 * API" use case — not the main Meta app id):
 *   authorize  www.threads.com/oauth/authorize (HTTPS redirect required)
 *   exchange   POST graph.threads.com/oauth/access_token → short-lived (1h)
 *   long-lived GET  /access_token?grant_type=th_exchange_token → 60 days
 *   refresh    GET  /refresh_access_token?grant_type=th_refresh_token
 */
export function threadsAuthorizationUrl(app: MetaAppConfig, state: string, redirectUri: string): string {
  const url = new URL(THREADS_API.authorizeUrl);
  url.search = new URLSearchParams({
    client_id: app.appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: REQUIRED_SCOPES.threads.join(","),
    state,
  }).toString();
  return url.toString();
}

const expiresAt = (seconds: number | undefined) => (seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null);

export async function threadsConnect(app: MetaAppConfig, code: string, redirectUri: string, fetchImpl?: FetchLike): Promise<ConnectResult> {
  const short = await threadsTokenHost(fetchImpl).post<{ access_token: string; user_id?: string | number }>(
    "/oauth/access_token",
    { client_id: app.appId, client_secret: app.appSecret, code: code.replace(/#_$/, ""), grant_type: "authorization_code", redirect_uri: redirectUri },
    "threads.exchange_code",
  );
  const long = await threadsTokenHost(fetchImpl).get<{ access_token: string; expires_in?: number }>(
    "/access_token",
    { grant_type: "th_exchange_token", client_secret: app.appSecret, access_token: short.access_token },
    "threads.long_lived_token",
  );
  const profile = await threadsGraph(fetchImpl).get<ThreadsProfile>(
    "/me",
    { fields: "id,username,name,threads_profile_picture_url,threads_biography", access_token: long.access_token },
    "threads.profile",
  );
  return {
    token: { accessToken: long.access_token, expiresAt: expiresAt(long.expires_in), scopes: REQUIRED_SCOPES.threads },
    candidates: [toThreadsCandidate(profile)],
  };
}

export async function threadsRefresh(token: TokenSet, fetchImpl?: FetchLike): Promise<TokenSet> {
  const refreshed = await threadsTokenHost(fetchImpl).get<{ access_token: string; expires_in?: number }>(
    "/refresh_access_token",
    { grant_type: "th_refresh_token", access_token: token.accessToken },
    "threads.refresh_token",
  );
  return { accessToken: refreshed.access_token, expiresAt: expiresAt(refreshed.expires_in), scopes: token.scopes };
}
