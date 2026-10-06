import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AppUser, BrandBrain, OrganizationMembership } from "@/lib/domain/types";
import type { DataRepository } from "@/lib/data/repository";
import { getCurrentUser, getRepository } from "./service";

export const CURRENT_ORG_COOKIE = "naoru_org";

export interface AppContext {
  user: AppUser;
  repo: DataRepository;
  memberships: OrganizationMembership[];
  current: OrganizationMembership;
  brain: BrandBrain;
}

/** Signed-in user + repository, or redirect to /login. */
export const requireUser = cache(async (): Promise<{ user: AppUser; repo: DataRepository }> => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return { user, repo: await getRepository(user) };
});

/**
 * Resolves the organization the user is working in. The cookie only *selects*
 * among the user's own memberships, so a forged value can never grant access.
 */
export const getOrganizationContext = cache(async () => {
  const { user, repo } = await requireUser();
  const memberships = await repo.listMemberships();
  const selectedId = (await cookies()).get(CURRENT_ORG_COOKIE)?.value;
  const current = memberships.find((m) => m.organization.id === selectedId) ?? memberships[0] ?? null;
  return { user, repo, memberships, current };
});

/**
 * Full app context for pages inside the product. Users without an
 * organization or with an unfinished onboarding are sent to /onboarding.
 */
export const requireAppContext = cache(async (): Promise<AppContext> => {
  const { user, repo, memberships, current } = await getOrganizationContext();
  if (!current) redirect("/onboarding");
  const brain = await repo.getBrandBrain(current.organization.id);
  if (!brain || !brain.onboardingCompletedAt) redirect("/onboarding");
  return { user, repo, memberships, current, brain };
});
