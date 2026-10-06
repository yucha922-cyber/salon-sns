import { redirect } from "next/navigation";
import { getOrganizationContext } from "@/lib/auth/context";
import { emptyBrandBrainInput, toBrandBrainInput } from "@/lib/brand/defaults";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { BrandLogo } from "@/components/auth/brand-logo";
import { signOutAction } from "@/app/actions/auth";

export const metadata = { title: "はじめての設定 | NAORU" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: createNew } = await searchParams;
  const { repo, current } = await getOrganizationContext();

  // Resume the current organization's onboarding unless a new org was requested.
  const brain = !createNew && current ? await repo.getBrandBrain(current.organization.id) : null;
  if (brain?.onboardingCompletedAt) redirect("/dashboard");

  const initial = brain ? toBrandBrainInput(brain) : emptyBrandBrainInput();
  if (initial.industry.key === "custom" && !initial.industry.label) initial.industry = { key: "seitai", label: "整体" };
  if (!initial.locations.length) initial.locations = [{ name: "", address: "" }];
  if (!initial.services.length) initial.services = [{ name: "", description: "", price: null }];

  return (
    <div className="onboarding-shell">
      <div className="onboarding-top">
        <BrandLogo />
        <form action={signOutAction}>
          <button className="button small" type="submit">ログアウト</button>
        </form>
      </div>
      <OnboardingWizard
        initial={initial}
        initialStep={brain?.onboardingStep ?? 0}
        hasOrganization={Boolean(brain)}
        canCreateDemo={!brain}
      />
    </div>
  );
}
