import "server-only";
import { getMetaAppConfig } from "./config";
import { hmacSha256, safeEqual } from "./crypto";
import type { PublishablePlatform } from "./types";

/**
 * Meta signed_request (deauthorize / data deletion callbacks):
 *   <base64url HMAC-SHA256(payload, app secret)>.<base64url JSON payload>
 * Returns the payload + which app (Instagram / Threads) signed it.
 */
export function parseSignedRequest(signedRequest: string | null): { platform: PublishablePlatform; userId: string } | null {
  if (!signedRequest) return null;
  const [sig, payload] = signedRequest.split(".");
  if (!sig || !payload) return null;
  for (const platform of ["instagram", "threads"] as const) {
    const app = getMetaAppConfig(platform);
    if (!app) continue;
    const expected = hmacSha256(app.appSecret, payload).toString("base64url");
    if (!safeEqual(expected, sig.replace(/=+$/, ""))) continue;
    try {
      const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { user_id?: string | number; algorithm?: string };
      if (data.algorithm && data.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
      if (data.user_id === undefined) return null;
      return { platform, userId: String(data.user_id) };
    } catch {
      return null;
    }
  }
  return null;
}

/** X-Hub-Signature-256 = "sha256=<hex HMAC of raw body>" signed with the app secret. */
export function verifyWebhookSignature(rawBody: string, header: string | null): PublishablePlatform | null {
  if (!header?.startsWith("sha256=")) return null;
  const received = header.slice(7);
  for (const platform of ["instagram", "threads"] as const) {
    const app = getMetaAppConfig(platform);
    if (app && safeEqual(hmacSha256(app.appSecret, rawBody).toString("hex"), received)) return platform;
  }
  return null;
}
