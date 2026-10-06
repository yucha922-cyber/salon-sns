import "server-only";
import { getDataMode } from "@/lib/env";
import type { PublishablePlatform } from "./types";

/**
 * Server-only configuration for the Meta integrations.
 * Hosts / versions are configurable because Meta moves them (e.g. Threads
 * moved graph.threads.net → graph.threads.com in its official sample, 2026-03).
 */
export interface MetaAppConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export const INSTAGRAM_API = {
  authorizeUrl: process.env.INSTAGRAM_AUTHORIZE_URL ?? "https://www.instagram.com/oauth/authorize",
  tokenUrl: process.env.INSTAGRAM_TOKEN_URL ?? "https://api.instagram.com/oauth/access_token",
  graphBase: process.env.INSTAGRAM_GRAPH_BASE_URL ?? "https://graph.instagram.com",
  version: process.env.INSTAGRAM_GRAPH_API_VERSION ?? "v26.0",
};

export const THREADS_API = {
  authorizeUrl: process.env.THREADS_AUTHORIZE_URL ?? "https://www.threads.com/oauth/authorize",
  graphBase: process.env.THREADS_GRAPH_BASE_URL ?? "https://graph.threads.com",
  version: process.env.THREADS_GRAPH_API_VERSION ?? "v1.0",
};

/** Scopes requested at connect time (minimum needed for publish + insights). */
export const REQUIRED_SCOPES: Record<PublishablePlatform, string[]> = {
  instagram: ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"],
  threads: ["threads_basic", "threads_content_publish", "threads_manage_insights"],
};

export function getMetaAppConfig(platform: PublishablePlatform): MetaAppConfig | null {
  const prefix = platform === "instagram" ? "INSTAGRAM" : "THREADS";
  const appId = process.env[`${prefix}_APP_ID`];
  const appSecret = process.env[`${prefix}_APP_SECRET`];
  if (!appId || !appSecret) return null;
  return {
    appId,
    appSecret,
    redirectUri: process.env[`${prefix}_REDIRECT_URI`] ?? `${getAppUrl()}/api/social/callback/${platform}`,
  };
}

/**
 * Which provider implementation serves an organization:
 *   - demo data mode or demo organizations → MockSocialProvider (never calls Meta)
 *   - otherwise the real Meta provider (requires the app credentials above)
 * SOCIAL_PROVIDER_MODE=mock forces the mock everywhere (staging / E2E).
 */
export function socialProviderKind(isDemoOrganization: boolean): "mock" | "meta" {
  if (process.env.SOCIAL_PROVIDER_MODE === "mock") return "mock";
  if (getDataMode() === "demo" || isDemoOrganization) return "mock";
  return "meta";
}

export function getWebhookVerifyToken(): string | null {
  return process.env.META_WEBHOOK_VERIFY_TOKEN || null;
}

export function getCronSecret(): string | null {
  return process.env.CRON_SECRET || null;
}
