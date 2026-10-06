import "server-only";
import type { DataRepository } from "@/lib/data/repository";
import type { Organization } from "@/lib/domain/types";
import { buildDemoPosts, DEMO_BRAND_BRAIN, DEMO_ORGANIZATION_NAME } from "@/lib/demo/seed";

/**
 * Creates a fully populated demo organization for the current user.
 * The organization is flagged is_demo so it is never mixed with real data.
 */
export async function createDemoOrganization(repo: DataRepository): Promise<Organization> {
  const organization = await repo.createOrganization(DEMO_ORGANIZATION_NAME, { isDemo: true });
  await repo.saveBrandBrain(organization.id, DEMO_BRAND_BRAIN, { onboardingStep: 6, completeOnboarding: true });
  for (const post of buildDemoPosts()) {
    await repo.createPost(organization.id, post);
  }
  return organization;
}
