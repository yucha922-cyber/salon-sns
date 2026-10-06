import "server-only";
import { createHash } from "node:crypto";
import { randomToken, safeEqual, signPayload, verifyPayload } from "./crypto";
import type { PublishablePlatform } from "./types";

/**
 * OAuth CSRF protection.
 *   - A random `state` goes to Meta and comes back on the callback.
 *   - An httpOnly, SameSite=Lax, HMAC-signed cookie binds that state to the
 *     user, organization, platform and (optionally) the target account.
 * The callback only proceeds when the returned state matches the cookie, the
 * cookie signature is valid and not expired, and the signed-in user is the
 * same user who started the flow.
 */
export const OAUTH_STATE_COOKIE = "naoru_social_oauth";
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export interface OAuthStateData {
  stateHash: string;
  userId: string;
  organizationId: string;
  platform: PublishablePlatform;
  /** existing social account the user clicked "connect" on (optional) */
  accountId: string | null;
  [key: string]: unknown;
}

const hash = (state: string) => createHash("sha256").update(state).digest("base64url");

export function createOAuthState(input: Omit<OAuthStateData, "stateHash">): { state: string; cookie: string } {
  const state = randomToken(24);
  return { state, cookie: signPayload({ ...input, stateHash: hash(state) }, OAUTH_STATE_TTL_SECONDS) };
}

export type OAuthStateCheck =
  | { ok: true; data: OAuthStateData }
  | { ok: false; reason: "missing" | "invalid" | "mismatch" | "wrong_user" | "wrong_platform" };

export function verifyOAuthState(params: {
  cookie: string | undefined;
  state: string | null;
  userId: string;
  platform: PublishablePlatform;
}): OAuthStateCheck {
  if (!params.cookie || !params.state) return { ok: false, reason: "missing" };
  const data = verifyPayload<OAuthStateData>(params.cookie);
  if (!data) return { ok: false, reason: "invalid" };
  if (!safeEqual(data.stateHash, hash(params.state))) return { ok: false, reason: "mismatch" };
  if (data.userId !== params.userId) return { ok: false, reason: "wrong_user" };
  if (data.platform !== params.platform) return { ok: false, reason: "wrong_platform" };
  return { ok: true, data };
}

export const oauthStateCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/social",
  maxAge: OAUTH_STATE_TTL_SECONDS,
};
