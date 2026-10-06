/**
 * Performance read models (pure): SNS dashboard, cross-location HQ table and
 * the "what needs attention" list. Computed from our own time-series
 * snapshots; anything without enough data is flagged instead of charted.
 */
import type { AccountGoal, ID, LocationProfile, Post, Recommendation, SnsAccount } from "@/lib/domain/types";
import { PLATFORM_LABELS } from "@/lib/domain/labels";
import { connectionBadge } from "./connection";
import {
  accountBaseline,
  audience,
  kpiGroupForGoal,
  latestByPost,
  MIN_SAMPLE,
  primaryMetricForGoal,
  RATE_LABELS,
  rates,
  relativeDiff,
} from "./metrics";
import type { MetricSnapshot, NormalizedMetrics, PublishJob, PublishablePlatform } from "./types";
import { isPublishablePlatform } from "./types";

export interface PostPerformance {
  post: Post;
  account: SnsAccount;
  locationName: string;
  metrics: NormalizedMetrics;
  hoursSincePublish: number | null;
  engagementRate?: number;
  saveRate?: number;
  profileVisitRate?: number;
  primaryLabel: string;
  primaryRate?: number;
  /** primary rate vs. the account baseline (e.g. 0.31 = +31%) */
  vsBaseline?: number;
}

export interface GroupPerformance {
  key: string;
  label: string;
  posts: number;
  reach?: number;
  views?: number;
  engagements?: number;
  engagementRate?: number;
  saveRate?: number;
}

export interface PerformanceOverview {
  periodDays: number;
  publishedCount: number;
  measuredCount: number;
  insufficient: boolean;
  totals: { reach?: number; views?: number; engagements?: number; saves?: number; profileVisits?: number; clicks?: number; follows?: number };
  engagementRate?: number;
  followerGrowth?: number;
  followers?: number;
  topPosts: PostPerformance[];
  worstPosts: PostPerformance[];
  byPillar: GroupPerformance[];
  byPlatform: GroupPerformance[];
  byLocation: GroupPerformance[];
  byGoal: GroupPerformance[];
}

export interface AnalyticsInput {
  posts: Post[];
  accounts: SnsAccount[];
  locations: LocationProfile[];
  snapshots: MetricSnapshot[];
  jobs?: PublishJob[];
  recommendations?: Recommendation[];
  now?: Date;
}

const GOAL_GROUP_LABELS = { acquisition: "集客", recruitment: "採用", branding: "ブランド・その他" } as const;

function sum(values: (number | undefined)[]): number | undefined {
  const v = values.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) : undefined;
}

function avg(values: (number | undefined)[]): number | undefined {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
}

export function locationNameOf(locations: LocationProfile[], id: ID | null): string {
  return id ? (locations.find((l) => l.locationId === id)?.locationName ?? "店舗") : "本部";
}

/** Latest metrics of every published post (with account baseline comparison). */
export function postPerformances(input: AnalyticsInput): PostPerformance[] {
  const latest = latestByPost(input.snapshots);
  const byAccount = new Map<ID, MetricSnapshot[]>();
  for (const s of latest.values()) byAccount.set(s.socialAccountId, [...(byAccount.get(s.socialAccountId) ?? []), s]);
  const out: PostPerformance[] = [];
  for (const post of input.posts) {
    const snap = latest.get(post.id);
    const account = input.accounts.find((a) => a.id === post.accountId);
    if (!snap || !account || !isPublishablePlatform(account.platform)) continue;
    const r = rates(snap.metrics);
    const primary = primaryMetricForGoal(account.goal, account.platform as PublishablePlatform);
    const base = accountBaseline(byAccount.get(account.id) ?? [], post.id);
    out.push({
      post,
      account,
      locationName: locationNameOf(input.locations, account.locationId),
      metrics: snap.metrics,
      hoursSincePublish: snap.hoursSincePublish,
      ...r,
      primaryLabel: RATE_LABELS[primary],
      primaryRate: r[primary],
      vsBaseline: base.sampleSize >= 2 ? relativeDiff(r[primary], base[primary]) : undefined,
    });
  }
  return out;
}

function group(items: PostPerformance[], keyOf: (p: PostPerformance) => string, labelOf: (key: string) => string): GroupPerformance[] {
  const map = new Map<string, PostPerformance[]>();
  for (const it of items) map.set(keyOf(it), [...(map.get(keyOf(it)) ?? []), it]);
  return [...map.entries()]
    .map(([key, rows]) => ({
      key,
      label: labelOf(key),
      posts: rows.length,
      reach: sum(rows.map((r) => r.metrics.reach)),
      views: sum(rows.map((r) => r.metrics.views)),
      engagements: sum(rows.map((r) => r.metrics.engagements)),
      engagementRate: avg(rows.map((r) => r.engagementRate)),
      saveRate: avg(rows.map((r) => r.saveRate)),
    }))
    .sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0));
}

export function computePerformanceOverview(
  input: AnalyticsInput,
  filter: { goal?: "acquisition" | "recruitment" | "branding" | "all"; periodDays?: number; pillarLabel?: (key: string) => string } = {},
): PerformanceOverview {
  const now = input.now ?? new Date();
  const periodDays = filter.periodDays ?? 30;
  const since = now.getTime() - periodDays * 86_400_000;
  const goalOk = (g: AccountGoal) => !filter.goal || filter.goal === "all" || kpiGroupForGoal(g) === filter.goal;
  const inPeriod = (p: Post) => p.status === "published" && new Date(p.publishing.publishedAt ?? p.scheduledAt ?? 0).getTime() >= since;
  const accountsInScope = input.accounts.filter((a) => goalOk(a.goal));
  const posts = input.posts.filter((p) => inPeriod(p) && accountsInScope.some((a) => a.id === p.accountId));
  const perf = postPerformances({ ...input, posts, accounts: accountsInScope });
  const ranked = perf.filter((p) => p.primaryRate !== undefined).sort((a, b) => (b.vsBaseline ?? b.primaryRate ?? 0) - (a.vsBaseline ?? a.primaryRate ?? 0));

  // Follower growth = Σ(last − first) of account snapshots in the period.
  let followerGrowth: number | undefined;
  let followers: number | undefined;
  for (const a of accountsInScope) {
    const series = input.snapshots
      .filter((s) => s.scope === "account" && s.socialAccountId === a.id && typeof s.metrics.followers === "number" && new Date(s.capturedAt).getTime() >= since)
      .sort((x, y) => x.capturedAt.localeCompare(y.capturedAt));
    const first = series[0]?.metrics.followers;
    const last = series[series.length - 1]?.metrics.followers;
    if (typeof first === "number" && typeof last === "number" && series.length >= 2) followerGrowth = (followerGrowth ?? 0) + (last - first);
    if (typeof last === "number") followers = (followers ?? 0) + last;
  }

  const reach = sum(perf.map((p) => audience(p.metrics)));
  const engagements = sum(perf.map((p) => p.metrics.engagements));
  return {
    periodDays,
    publishedCount: posts.length,
    measuredCount: perf.length,
    insufficient: perf.length < MIN_SAMPLE,
    totals: {
      reach: sum(perf.map((p) => p.metrics.reach)),
      views: sum(perf.map((p) => p.metrics.views)),
      engagements,
      saves: sum(perf.map((p) => p.metrics.saves)),
      profileVisits: sum(perf.map((p) => p.metrics.profileVisits)),
      clicks: sum(perf.map((p) => p.metrics.clicks)),
      follows: sum(perf.map((p) => p.metrics.follows)),
    },
    engagementRate: reach && engagements !== undefined ? engagements / reach : undefined,
    followerGrowth,
    followers,
    topPosts: ranked.slice(0, 3),
    worstPosts: ranked.length >= 4 ? ranked.slice(-3).reverse() : [],
    byPillar: group(perf, (p) => p.post.planning.contentPillar || "未設定", filter.pillarLabel ?? ((k) => k)).filter((g) => g.posts >= 1),
    byPlatform: group(perf, (p) => p.account.platform, (k) => PLATFORM_LABELS[k as keyof typeof PLATFORM_LABELS] ?? k),
    byLocation: group(perf, (p) => p.account.locationId ?? "hq", (k) => (k === "hq" ? "本部" : locationNameOf(input.locations, k))),
    byGoal: group(perf, (p) => kpiGroupForGoal(p.account.goal), (k) => GOAL_GROUP_LABELS[k as keyof typeof GOAL_GROUP_LABELS] ?? k),
  };
}

// ---------------------------------------------------------------------------
// HQ: attention list & cross-location table
// ---------------------------------------------------------------------------

export interface AttentionItem {
  kind: "problem" | "opportunity" | "info";
  title: string;
  detail: string;
  href: string;
  accountId: ID | null;
  locationId: ID | null;
}

export function computeAttention(input: AnalyticsInput): AttentionItem[] {
  const now = input.now ?? new Date();
  const items: (AttentionItem & { rank: number })[] = [];
  const stale: { name: string; days: number; accountId: ID; locationId: ID | null }[] = [];
  const perf = postPerformances(input);
  for (const a of input.accounts.filter((x) => x.active && isPublishablePlatform(x.platform))) {
    const loc = locationNameOf(input.locations, a.locationId);
    const name = `${loc} ${PLATFORM_LABELS[a.platform]}`;
    const badge = connectionBadge(a.connection, now);
    const base = { accountId: a.id, locationId: a.locationId };
    if (badge === "reconnect") items.push({ ...base, rank: 0, kind: "problem", title: `${name}（${a.handle}）の再接続が必要です`, detail: "認証が切れているため、予約投稿とInsights取得が止まっています。", href: "/accounts" });
    else if (badge === "error") items.push({ ...base, rank: 0, kind: "problem", title: `${name}の接続でエラーが発生しています`, detail: a.connection.error ?? "再接続をお試しください。", href: "/accounts" });
    else if (badge === "expiring") items.push({ ...base, rank: 6, kind: "info", title: `${name}のトークン期限が近づいています`, detail: "自動更新されますが、失敗した場合は再接続してください。", href: "/accounts" });
    if (badge === "not_connected" || badge === "disconnected") continue;

    const mine = input.posts.filter((p) => p.accountId === a.id);
    const lastPublished = mine
      .filter((p) => p.status === "published")
      .map((p) => new Date(p.publishing.publishedAt ?? p.scheduledAt ?? 0).getTime())
      .sort((x, y) => y - x)[0];
    // Something planned/queued within the next 2 days counts as "covered".
    const upcoming = mine.some((p) => ["queued", "approved", "scheduled", "publishing"].includes(p.status) && p.scheduledAt && new Date(p.scheduledAt).getTime() >= now.getTime() && new Date(p.scheduledAt).getTime() < now.getTime() + 2 * 86_400_000);
    if (lastPublished !== undefined && now.getTime() - lastPublished > 3 * 86_400_000 && !upcoming) {
      stale.push({ name, days: Math.floor((now.getTime() - lastPublished) / 86_400_000), accountId: a.id, locationId: a.locationId });
    }

    const rows = perf.filter((p) => p.account.id === a.id).sort((x, y) => new Date(y.post.publishing.publishedAt ?? 0).getTime() - new Date(x.post.publishing.publishedAt ?? 0).getTime());
    if (rows.length >= 4) {
      const recent = avg(rows.slice(0, 2).map((r) => r.primaryRate));
      const prior = avg(rows.slice(2, 8).map((r) => r.primaryRate));
      const diff = relativeDiff(recent, prior);
      const label = rows[0]?.primaryLabel ?? "主要指標";
      if (diff !== undefined && diff <= -0.2) items.push({ ...base, rank: 2, kind: "problem", title: `${name}の${label}が低下（${Math.round(diff * 100)}%）`, detail: `直近2投稿の${label}が、それ以前の平均を下回っています。フックや投稿時間を見直しましょう。`, href: "/performance" });
      if (diff !== undefined && diff >= 0.2) items.push({ ...base, rank: 3, kind: "opportunity", title: `${name}の${label}が上昇（+${Math.round(diff * 100)}%）`, detail: "反応の良い型をMarketing Memoryで確認し、次の企画に活かしましょう。", href: "/performance" });
    }
    const star = rows.find((r) => (r.vsBaseline ?? 0) >= 0.3 && now.getTime() - new Date(r.post.publishing.publishedAt ?? 0).getTime() < 14 * 86_400_000);
    if (star) items.push({ ...base, rank: 3, kind: "opportunity", title: `${loc}「${star.post.title}」が高パフォーマンス`, detail: `${star.primaryLabel}がアカウント平均より+${Math.round((star.vsBaseline ?? 0) * 100)}%。同じ型の投稿を増やす余地があります。`, href: "/performance" });
  }
  for (const job of (input.jobs ?? []).filter((j) => j.status === "failed" && now.getTime() - new Date(j.updatedAt).getTime() < 7 * 86_400_000)) {
    items.push({ rank: 1, kind: "problem", title: `投稿に失敗：「${job.content.title}」`, detail: job.lastError ?? "Publish Queueで原因を確認してください。", href: "/publishing", accountId: job.socialAccountId, locationId: job.locationId });
  }
  const pendingRecs = (input.recommendations ?? []).filter((r) => r.status === "pending");
  if (stale.length) {
    stale.sort((x, y) => y.days - x.days);
    const one = stale.length === 1 ? stale[0] : null;
    items.push({
      rank: 4,
      kind: "problem",
      title: one ? `${one.name}の投稿が${one.days}日間ありません` : `${stale.length}アカウントで投稿が3日以上空いています`,
      detail: `${stale.slice(0, 4).map((x) => `${x.name} ${x.days}日`).join("・")}${stale.length > 4 ? " ほか" : ""}。SNS Plannerで次の投稿を予約しましょう。`,
      href: "/planner",
      accountId: one?.accountId ?? null,
      locationId: one?.locationId ?? null,
    });
  }
  if (pendingRecs.length) items.push({ rank: 7, kind: "info", title: `承認待ちのAI Recommendationが${pendingRecs.length}件あります`, detail: "承認するとSNS Plannerに反映されます。", href: "/analysis", accountId: null, locationId: null });
  // Most urgent first: broken connections / failures → metric drops → opportunities → posting gaps → info.
  return items.sort((x, y) => x.rank - y.rank).map(({ rank: _rank, ...item }) => item);
}

export interface CrossLocationRow {
  locationId: ID | null;
  locationName: string;
  account: SnsAccount;
  goalLabel: string;
  posts: number;
  reach?: number;
  engagementRate?: number;
  growth?: number;
  topContent: string | null;
  warnings: number;
  recommendations: number;
}

export function computeCrossLocation(input: AnalyticsInput, periodDays = 30): CrossLocationRow[] {
  const now = input.now ?? new Date();
  const since = now.getTime() - periodDays * 86_400_000;
  const perf = postPerformances(input).filter((p) => new Date(p.post.publishing.publishedAt ?? 0).getTime() >= since);
  const attention = computeAttention(input).filter((i) => i.kind === "problem");
  return input.accounts
    .filter((a) => a.active && isPublishablePlatform(a.platform))
    .map((a) => {
      const rows = perf.filter((p) => p.account.id === a.id);
      const series = input.snapshots
        .filter((s) => s.scope === "account" && s.socialAccountId === a.id && typeof s.metrics.followers === "number" && new Date(s.capturedAt).getTime() >= since)
        .sort((x, y) => x.capturedAt.localeCompare(y.capturedAt));
      const first = series[0]?.metrics.followers;
      const last = series[series.length - 1]?.metrics.followers;
      const top = [...rows].sort((x, y) => (y.primaryRate ?? 0) - (x.primaryRate ?? 0))[0];
      return {
        locationId: a.locationId,
        locationName: locationNameOf(input.locations, a.locationId),
        account: a,
        goalLabel: GOAL_GROUP_LABELS[kpiGroupForGoal(a.goal)],
        posts: rows.length,
        reach: sum(rows.map((r) => audience(r.metrics))),
        engagementRate: avg(rows.map((r) => r.engagementRate)),
        growth: typeof first === "number" && typeof last === "number" && series.length >= 2 ? last - first : undefined,
        topContent: top?.post.title ?? null,
        warnings: attention.filter((i) => i.accountId === a.id).length,
        recommendations: (input.recommendations ?? []).filter((r) => r.status === "pending" && r.socialAccountId === a.id).length,
      };
    })
    .sort((x, y) => (x.locationId ?? "").localeCompare(y.locationId ?? "") || x.account.platform.localeCompare(y.account.platform));
}
