import "server-only";
import type { DataRepository } from "@/lib/data/repository";
import type { Organization, SnsAccount } from "@/lib/domain/types";
import { getSystemStore } from "@/lib/social/access";
import type { SocialStore } from "@/lib/social/store";
import { seedDemoSocial } from "@/lib/demo/social-seed";
import { seedDemoAds } from "@/lib/demo/ads-seed";
import { getSystemAdsStore } from "@/lib/ads/access";
import type { AdsStore } from "@/lib/ads/store";
import {
  buildDemoHistoryPosts,
  buildDemoHqCampaign,
  buildDemoPosts,
  DEMO_ACCOUNTS,
  DEMO_BRAND_BRAIN,
  DEMO_LOCATION_PROFILES,
  DEMO_ORGANIZATION_NAME,
  DEMO_RECOMMENDATIONS,
} from "@/lib/demo/seed";

/**
 * Creates a fully populated demo organization for the current user.
 * The organization is flagged is_demo so it is never mixed with real data.
 */
export async function createDemoOrganization(repo: DataRepository, options: { social?: SocialStore | null; ads?: AdsStore | null } = {}): Promise<Organization> {
  const organization = await repo.createOrganization(DEMO_ORGANIZATION_NAME, { isDemo: true });
  const brain = await repo.saveBrandBrain(organization.id, DEMO_BRAND_BRAIN, { onboardingStep: 6, completeOnboarding: true });
  const locationIds = brain.locations.map((l) => l.id ?? null);

  for (const [index, profile] of DEMO_LOCATION_PROFILES.entries()) {
    const id = locationIds[index];
    if (id) await repo.saveLocationProfile(organization.id, id, profile);
  }
  // Brand-default accounts (created from the Brand Brain handles) are reused, not duplicated.
  const defaults = await repo.listAccounts(organization.id);
  const accounts: SnsAccount[] = [];
  for (const { locationIndex, ...account } of DEMO_ACCOUNTS) {
    const locationId = locationIndex === null ? null : (locationIds[locationIndex] ?? null);
    const existing = defaults.find((a) => a.isBrandDefault && a.platform === account.platform && a.handle === account.handle);
    accounts.push(await repo.saveAccount(organization.id, existing?.id ?? null, { ...account, locationId }));
  }
  await repo.saveHqCampaign(organization.id, null, {
    ...buildDemoHqCampaign(),
    targetLocationIds: locationIds.filter((id): id is string => Boolean(id)),
  });

  await repo.createRecommendations(
    organization.id,
    DEMO_RECOMMENDATIONS.map(({ accountHandle, ...rec }) => {
      const account = accountHandle ? accounts.find((a) => a.handle === accountHandle) : undefined;
      return { ...rec, socialAccountId: account?.id ?? null, locationId: account?.locationId ?? null };
    }),
  );

  // Demo planner posts across stores and HQ accounts (acquisition + recruitment),
  // plus ~6 weeks of published history for the Measure → Learn loop.
  for (const { accountHandle, ...post } of [...buildDemoHistoryPosts(), ...buildDemoPosts()]) {
    const account = accounts.find((a) => a.handle === accountHandle);
    await repo.createPost(organization.id, { ...post, accountId: account?.id ?? null, locationId: account?.locationId ?? null });
  }
  // Mock connections, publish jobs, insights, reviews, Marketing Memory.
  const social = options.social === undefined ? getSystemStore() : options.social;
  if (social) {
    try {
      await seedDemoSocial(social, repo, organization.id);
    } catch (error) {
      console.error("[demo] social seed failed", error instanceof Error ? error.message : error);
    }
  }
  // Meta ads loop on the MockAdsProvider (ad account, 30 days of Insights, tests, Creative Memory).
  const ads = options.ads === undefined ? getSystemAdsStore() : options.ads;
  if (ads) {
    try {
      await seedDemoAds(ads, social, repo, organization.id, null);
    } catch (error) {
      console.error("[demo] ads seed failed", error instanceof Error ? error.message : error);
    }
  }
  return organization;
}
