/**
 * HQ operations read model: per-location / per-account plan coverage for a
 * month, computed from our own data (strategies + planner posts). Used by the
 * dashboard scope switcher and as facts for the AI operations review.
 */
import type { HqCampaign, LocationProfile, Post, SnsAccount } from "@/lib/domain/types";
import { jstDateKey } from "@/lib/domain/dates";

export type Scope = { kind: "all" } | { kind: "location"; id: string } | { kind: "account"; id: string };

export function parseScope(value: string | undefined): Scope {
  if (value?.startsWith("loc:")) return { kind: "location", id: value.slice(4) };
  if (value?.startsWith("acc:")) return { kind: "account", id: value.slice(4) };
  return { kind: "all" };
}

export interface AccountStatus {
  account: SnsAccount;
  locationName: string;
  monthlyTarget: number;
  planned: number;
  approved: number;
  drafts: number;
  coverage: number; // planned / target, 0..1+
}

export interface LocationStatus {
  locationId: string | null; // null = HQ
  name: string;
  accounts: AccountStatus[];
  monthlyTarget: number;
  planned: number;
  drafts: number;
}

export interface OperationsOverview {
  month: string; // YYYY-MM
  activeLocations: number;
  activeAccounts: number;
  acquisitionAccounts: number;
  recruitmentAccounts: number;
  plannedThisMonth: number;
  approvedThisMonth: number;
  draftThisMonth: number;
  activeCampaigns: HqCampaign[];
  locations: LocationStatus[];
}

const WEEKS_PER_MONTH = 4.3;

export function computeOperationsOverview(
  input: { accounts: SnsAccount[]; locations: LocationProfile[]; posts: Post[]; campaigns: HqCampaign[] },
  scope: Scope = { kind: "all" },
  now: Date = new Date(),
): OperationsOverview {
  const month = jstDateKey(now).slice(0, 7);
  const inScopeAccount = (a: SnsAccount) =>
    scope.kind === "all" || (scope.kind === "location" ? a.locationId === scope.id : a.id === scope.id);
  const accounts = input.accounts.filter(inScopeAccount);
  const postsThisMonth = input.posts.filter((p) => p.scheduledAt && jstDateKey(new Date(p.scheduledAt)).startsWith(month));
  const inScopePost = (p: Post) =>
    scope.kind === "all" || (scope.kind === "location" ? p.locationId === scope.id : p.accountId === scope.id);
  const scopedPosts = postsThisMonth.filter(inScopePost);

  const accountStatus = (a: SnsAccount): AccountStatus => {
    const mine = postsThisMonth.filter((p) => p.accountId === a.id);
    const monthlyTarget = a.active ? Math.round(a.strategy.postsPerWeek * WEEKS_PER_MONTH) : 0;
    return {
      account: a,
      locationName: input.locations.find((l) => l.locationId === a.locationId)?.locationName ?? "本部",
      monthlyTarget,
      planned: mine.length,
      approved: mine.filter((p) => p.status === "scheduled" || p.status === "published").length,
      drafts: mine.filter((p) => p.status === "draft").length,
      coverage: monthlyTarget ? mine.length / monthlyTarget : 1,
    };
  };

  const groups: { id: string | null; name: string }[] = [
    { id: null, name: "本部（HQ）" },
    ...input.locations.map((l) => ({ id: l.locationId, name: l.locationName })),
  ].filter((g) => scope.kind === "all" || (scope.kind === "location" ? g.id === scope.id : accounts.some((a) => a.locationId === g.id)));

  const locations: LocationStatus[] = groups.map((g) => {
    const statuses = accounts.filter((a) => a.locationId === g.id).map(accountStatus);
    return {
      locationId: g.id,
      name: g.name,
      accounts: statuses,
      monthlyTarget: statuses.reduce((n, s) => n + s.monthlyTarget, 0),
      planned: statuses.reduce((n, s) => n + s.planned, 0),
      drafts: statuses.reduce((n, s) => n + s.drafts, 0),
    };
  });

  const active = accounts.filter((a) => a.active);
  return {
    month,
    activeLocations: scope.kind === "all" ? input.locations.length : locations.filter((l) => l.locationId).length,
    activeAccounts: active.length,
    acquisitionAccounts: active.filter((a) => a.goal === "acquisition").length,
    recruitmentAccounts: active.filter((a) => a.goal === "recruitment").length,
    plannedThisMonth: scopedPosts.length,
    approvedThisMonth: scopedPosts.filter((p) => p.status === "scheduled" || p.status === "published").length,
    draftThisMonth: scopedPosts.filter((p) => p.status === "draft").length,
    activeCampaigns: input.campaigns.filter((c) => c.status === "active"),
    locations,
  };
}
