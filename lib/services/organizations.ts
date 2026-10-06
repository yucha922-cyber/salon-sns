import "server-only";
import type { DataRepository } from "@/lib/data/repository";
import type { Organization } from "@/lib/domain/types";
import {
  buildDemoHqCampaign,
  buildDemoPosts,
  DEMO_ACCOUNTS,
  DEMO_BRAND_BRAIN,
  DEMO_LOCATION_PROFILES,
  DEMO_ORGANIZATION_NAME,
} from "@/lib/demo/seed";

/**
 * Creates a fully populated demo organization for the current user.
 * The organization is flagged is_demo so it is never mixed with real data.
 */
export async function createDemoOrganization(repo: DataRepository): Promise<Organization> {
  const organization = await repo.createOrganization(DEMO_ORGANIZATION_NAME, { isDemo: true });
  const brain = await repo.saveBrandBrain(organization.id, DEMO_BRAND_BRAIN, { onboardingStep: 6, completeOnboarding: true });
  const locationIds = brain.locations.map((l) => l.id ?? null);

  for (const [index, profile] of DEMO_LOCATION_PROFILES.entries()) {
    const id = locationIds[index];
    if (id) await repo.saveLocationProfile(organization.id, id, profile);
  }
  // Brand-default accounts (created from the Brand Brain handles) are reused, not duplicated.
  const defaults = await repo.listAccounts(organization.id);
  const accounts = [];
  for (const { locationIndex, ...account } of DEMO_ACCOUNTS) {
    const locationId = locationIndex === null ? null : (locationIds[locationIndex] ?? null);
    const existing = defaults.find((a) => a.isBrandDefault && a.platform === account.platform && a.handle === account.handle);
    accounts.push(await repo.saveAccount(organization.id, existing?.id ?? null, { ...account, locationId }));
  }
  await repo.saveHqCampaign(organization.id, null, {
    ...buildDemoHqCampaign(),
    targetLocationIds: locationIds.filter((id): id is string => Boolean(id)),
  });

  // Demo posts belong to the Shibuya account.
  const shibuyaAccount = accounts.find((a) => a.locationId === locationIds[0] && a.goal === "acquisition");
  for (const post of buildDemoPosts()) {
    await repo.createPost(organization.id, { ...post, accountId: shibuyaAccount?.id ?? null, locationId: locationIds[0] ?? null });
  }
  return organization;
}
