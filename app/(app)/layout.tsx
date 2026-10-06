import type { ReactNode } from "react";
import { requireAppContext } from "@/lib/auth/context";
import { getRecommendations } from "@/lib/services/analytics";
import { AppShell } from "@/components/shell/app-shell";

// Every page below is user/org specific: never statically cached.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, memberships, current, brain } = await requireAppContext();
  const primaryLocation = brain.locations[0]?.name;
  return (
    <AppShell
      user={{ displayName: user.displayName, email: user.email }}
      role={current.role}
      organizations={memberships.map((m) => ({ id: m.organization.id, name: m.organization.name, isDemo: m.organization.isDemo }))}
      currentOrganizationId={current.organization.id}
      workspaceLabel={primaryLocation || brain.brandName || current.organization.name}
      analysisBadge={getRecommendations(current.organization).length}
    >
      {children}
    </AppShell>
  );
}
