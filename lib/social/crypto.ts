import "server-only";
import { getDataMode } from "@/lib/env";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Token encryption at rest (AES-256-GCM). Ciphertext format:
 *   v1:<iv b64url>:<auth tag b64url>:<ciphertext b64url>
 * Key: SOCIAL_TOKEN_ENCRYPTION_KEY = 32 random bytes, base64 (openssl rand -base64 32).
 * In demo / development a key is derived from DEMO_SESSION_SECRET so the app
 * works without setup; production requires the explicit key.
 */
function encryptionKey(): Buffer {
  const raw = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64)");
    return key;
  }
  // Real tenant data (Supabase mode) requires an explicit key; Demo Mode never holds real tokens.
  if (process.env.NODE_ENV === "production" && getDataMode() === "supabase" && process.env.SOCIAL_PROVIDER_MODE !== "mock") {
    throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY is required in production");
  }
  return createHash("sha256").update(`naoru-social-dev:${process.env.DEMO_SESSION_SECRET ?? "dev"}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("unsupported ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function hmacSha256(secret: string, data: string | Buffer): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

export function safeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const ab = Buffer.isBuffer(a) ? a : Buffer.from(a);
  const bb = Buffer.isBuffer(b) ? b : Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** HMAC-signed, expiring JSON payload (OAuth state cookie, mock authorization codes). */
export function signPayload(data: Record<string, unknown>, ttlSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  const sig = hmacSha256(encryptionKey().toString("base64"), `payload:${payload}`).toString("base64url");
  return `${payload}.${sig}`;
}

export function verifyPayload<T extends Record<string, unknown>>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = hmacSha256(encryptionKey().toString("base64"), `payload:${payload}`).toString("base64url");
  if (!safeEqual(expected, sig)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T & { exp?: number };
    if (typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null;
    return data;
  } catch {
    return null;
  }
}
