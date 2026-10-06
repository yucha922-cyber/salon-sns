import "server-only";
import { getMetaAppConfig, socialProviderKind } from "./config";
import { SocialApiError } from "./errors";
import { InstagramProvider } from "./instagram";
import { MockSocialProvider } from "./mock";
import type { SocialProvider } from "./provider";
import { ThreadsProvider } from "./threads";
import type { PublishablePlatform } from "./types";

/**
 * Picks the provider for an organization. Demo mode / demo organizations get
 * the mock (Demo UX without real accounts); everything else gets Meta.
 * Adding TikTok / X later = another SocialProvider + a branch here.
 */
export function getSocialProvider(platform: PublishablePlatform, options: { isDemoOrganization: boolean }): SocialProvider {
  if (socialProviderKind(options.isDemoOrganization) === "mock") return new MockSocialProvider(platform);
  const app = getMetaAppConfig(platform);
  if (!app) throw new SocialApiError("not_configured", `${platform} app credentials are not configured`);
  return platform === "instagram" ? new InstagramProvider(app) : new ThreadsProvider(app);
}

export function isProviderConfigured(platform: PublishablePlatform, isDemoOrganization: boolean): boolean {
  return socialProviderKind(isDemoOrganization) === "mock" || getMetaAppConfig(platform) !== null;
}

export function redirectUriFor(platform: PublishablePlatform, isDemoOrganization: boolean, appUrl: string): string {
  // Mock consent stays on the current origin (works on any preview URL / port).
  if (socialProviderKind(isDemoOrganization) === "mock") return `/api/social/callback/${platform}`;
  return getMetaAppConfig(platform)?.redirectUri ?? `${appUrl}/api/social/callback/${platform}`;
}
