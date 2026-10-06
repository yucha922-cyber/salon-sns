import type { ReactNode } from "react";
import { requireAppContext } from "@/lib/auth/context";
import { AppShell } from "@/components/shell/app-shell";

// Every page below is user/org specific: never statically cached.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, repo, memberships, current, brain } = await requireAppContext();
  const pendingRecommendations = (await repo.listRecommendations(current.organization.id)).filter((r) => r.status === "pending").length;
  const primaryLocation = brain.locations[0]?.name;
  return (
    <AppShell
      user={{ displayName: user.displayName, email: user.email }}
      role={current.role}
      organizations={memberships.map((m) => ({ id: m.organization.id, name: m.organization.name, isDemo: m.organization.isDemo }))}
      currentOrganizationId={current.organization.id}
      workspaceLabel={current.organization.name || primaryLocation || brain.brandName}
      analysisBadge={pendingRecommendations}
    >
      {children}
    </AppShell>
  );
}
