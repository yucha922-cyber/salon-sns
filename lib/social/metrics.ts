/**
 * Common metric layer (pure, client-safe).
 *   - goal-specific KPI definitions (acquisition / recruitment / branding)
 *   - derived rates, account baselines, 24h / 3d / 7d checkpoint comparisons
 * Metrics the platforms do not provide are marked "manual" (DM, LINE,
 * reservations, applications) instead of being invented.
 */
import type { AccountGoal, ID } from "@/lib/domain/types";
import type { MetricSnapshot, NormalizedMetricKey, NormalizedMetrics, PublishablePlatform } from "./types";

export const METRIC_LABELS: Record<NormalizedMetricKey, string> = {
  impressions: "インプレッション",
  reach: "リーチ",
  views: "閲覧数",
  engagements: "エンゲージメント",
  likes: "いいね",
  comments: "コメント・返信",
  shares: "シェア",
  saves: "保存",
  clicks: "リンククリック",
  follows: "フォロー",
  profileVisits: "プロフィールアクセス",
  conversions: "コンバージョン",
  followers: "フォロワー",
};

export interface GoalKpi {
  key: NormalizedMetricKey | "engagementRate" | "saveRate" | "dm" | "line" | "reservations" | "applications" | "careerClicks";
  label: string;
  /** api = from Instagram / Threads APIs, manual = needs reservation/ATS/LINE data (not connected yet) */
  source: "api" | "manual";
  platforms: PublishablePlatform[];
}

const BOTH: PublishablePlatform[] = ["instagram", "threads"];

export const GOAL_KPIS: Record<"acquisition" | "recruitment" | "branding", GoalKpi[]> = {
  acquisition: [
    { key: "reach", label: "リーチ", source: "api", platforms: ["instagram"] },
    { key: "profileVisits", label: "プロフィールアクセス", source: "api", platforms: ["instagram"] },
    { key: "clicks", label: "リンククリック", source: "api", platforms: BOTH },
    { key: "saveRate", label: "保存率", source: "api", platforms: ["instagram"] },
    { key: "dm", label: "DM", source: "manual", platforms: BOTH },
    { key: "line", label: "LINE登録", source: "manual", platforms: BOTH },
    { key: "reservations", label: "予約・来店", source: "manual", platforms: BOTH },
  ],
  recruitment: [
    { key: "reach", label: "リーチ", source: "api", platforms: ["instagram"] },
    { key: "views", label: "閲覧数", source: "api", platforms: BOTH },
    { key: "profileVisits", label: "プロフィールアクセス", source: "api", platforms: ["instagram"] },
    { key: "careerClicks", label: "採用ページクリック", source: "api", platforms: BOTH },
    { key: "dm", label: "DM", source: "manual", platforms: BOTH },
    { key: "applications", label: "応募", source: "manual", platforms: BOTH },
  ],
  branding: [
    { key: "reach", label: "リーチ", source: "api", platforms: ["instagram"] },
    { key: "views", label: "閲覧数", source: "api", platforms: BOTH },
    { key: "engagementRate", label: "エンゲージメント率", source: "api", platforms: BOTH },
    { key: "followers", label: "フォロワー", source: "api", platforms: BOTH },
  ],
};

export function kpiGroupForGoal(goal: AccountGoal | null): keyof typeof GOAL_KPIS {
  if (goal === "acquisition" || goal === "retention") return "acquisition";
  if (goal === "recruitment") return "recruitment";
  return "branding";
}

/** Primary success metric the AI evaluates for each goal. */
export function primaryMetricForGoal(goal: AccountGoal | null, platform: PublishablePlatform): "saveRate" | "engagementRate" | "profileVisitRate" {
  if (platform === "threads") return "engagementRate";
  if (goal === "recruitment") return "profileVisitRate";
  if (goal === "acquisition" || goal === "retention") return "saveRate";
  return "engagementRate";
}

export const RATE_LABELS = { saveRate: "保存率", engagementRate: "エンゲージメント率", profileVisitRate: "プロフィール遷移率" } as const;

/** Denominator: reach (Instagram) or views (Threads has no reach). */
export function audience(m: NormalizedMetrics): number | undefined {
  return m.reach ?? m.views;
}

export function rates(m: NormalizedMetrics): { saveRate?: number; engagementRate?: number; profileVisitRate?: number } {
  const a = audience(m);
  if (!a) return {};
  return {
    saveRate: m.saves !== undefined ? m.saves / a : undefined,
    engagementRate: m.engagements !== undefined ? m.engagements / a : undefined,
    profileVisitRate: m.profileVisits !== undefined ? m.profileVisits / a : undefined,
  };
}

export const CHECKPOINTS = [
  { hours: 24, label: "24時間後" },
  { hours: 72, label: "3日後" },
  { hours: 168, label: "7日後" },
] as const;

/** Snapshot that best represents "N hours after publish" (first one at/after N, within +50%). */
export function snapshotAtCheckpoint(snapshots: MetricSnapshot[], postId: ID, hours: number): MetricSnapshot | null {
  return (
    snapshots
      .filter((s) => s.postId === postId && s.hoursSincePublish !== null && s.hoursSincePublish >= hours && s.hoursSincePublish <= hours * 1.5 + 12)
      .sort((a, b) => (a.hoursSincePublish ?? 0) - (b.hoursSincePublish ?? 0))[0] ?? null
  );
}

export function latestByPost(snapshots: MetricSnapshot[]): Map<ID, MetricSnapshot> {
  const map = new Map<ID, MetricSnapshot>();
  for (const s of snapshots) {
    if (s.scope !== "post" || !s.postId) continue;
    const current = map.get(s.postId);
    if (!current || s.capturedAt > current.capturedAt) map.set(s.postId, s);
  }
  return map;
}

export function median(values: number[]): number | undefined {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return undefined;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : ((v[mid - 1] as number) + (v[mid] as number)) / 2;
}

export interface Baseline {
  sampleSize: number;
  reach?: number;
  views?: number;
  engagements?: number;
  saveRate?: number;
  engagementRate?: number;
  profileVisitRate?: number;
}

/** Account baseline = median of the account's other posts' latest metrics. */
export function accountBaseline(latest: MetricSnapshot[], excludePostId?: ID): Baseline {
  const rows = latest.filter((s) => s.postId !== excludePostId);
  const r = rows.map((s) => rates(s.metrics));
  return {
    sampleSize: rows.length,
    reach: median(rows.map((s) => s.metrics.reach ?? NaN)),
    views: median(rows.map((s) => s.metrics.views ?? NaN)),
    engagements: median(rows.map((s) => s.metrics.engagements ?? NaN)),
    saveRate: median(r.map((x) => x.saveRate ?? NaN)),
    engagementRate: median(r.map((x) => x.engagementRate ?? NaN)),
    profileVisitRate: median(r.map((x) => x.profileVisitRate ?? NaN)),
  };
}

/** Relative difference, e.g. 0.31 = +31%. */
export function relativeDiff(value: number | undefined, base: number | undefined): number | undefined {
  if (value === undefined || base === undefined || base === 0) return undefined;
  return (value - base) / base;
}

export function formatPercent(v: number | undefined, digits = 1): string {
  return v === undefined ? "—" : `${(v * 100).toFixed(digits)}%`;
}

export function formatSignedPercent(v: number | undefined): string {
  if (v === undefined) return "—";
  const p = Math.round(v * 100);
  return `${p > 0 ? "+" : ""}${p}%`;
}

export function formatNumber(v: number | undefined): string {
  return v === undefined ? "—" : new Intl.NumberFormat("ja-JP").format(Math.round(v));
}

/** Minimum posts with metrics before showing comparisons / charts. */
export const MIN_SAMPLE = 3;
