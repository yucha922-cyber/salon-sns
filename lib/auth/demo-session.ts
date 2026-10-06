import "server-only";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Demo-mode session: a small HMAC-signed cookie holding the user id.
 * Only used when Supabase is not configured.
 */
export const DEMO_SESSION_COOKIE = "naoru_demo_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
let warnedInsecureSecret = false;

function secret(): string {
  const value = process.env.DEMO_SESSION_SECRET;
  if (value && value.length >= 16) return value;
  if (process.env.NODE_ENV === "production" && !warnedInsecureSecret) {
    // Keep the demo usable, but make the weakness visible in logs.
    warnedInsecureSecret = true;
    console.warn("[naoru] DEMO_SESSION_SECRET is not set; using an insecure development secret.");
  }
  return "naoru-insecure-development-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function encodeDemoSession(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeDemoSession(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof data === "object" &&
      data !== null &&
      "uid" in data &&
      "exp" in data &&
      typeof data.uid === "string" &&
      typeof data.exp === "number" &&
      data.exp > Date.now() / 1000
    ) {
      return data.uid;
    }
  } catch {
    return null;
  }
  return null;
}

export const demoSessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
