import "server-only";
import type { Campaign, MetricSummary, Organization, Post } from "@/lib/domain/types";
import { DEMO_AD_METRICS, DEMO_CAMPAIGNS, DEMO_METRICS } from "@/lib/demo/seed";
import type { PerformanceOverview } from "@/lib/social/analytics";

/**
 * Analytics read model. External SNS / ad APIs are not connected yet, so:
 *   - demo organizations get the demo dataset,
 *   - real organizations get only numbers we can compute from our own data
 *     (post counts) and explicit "未連携" placeholders — never fake numbers.
 */
export function getDashboardMetrics(
  org: Organization,
  posts: Post[],
  performance?: PerformanceOverview | null,
): { sns: MetricSummary[]; ads: MetricSummary[] | null } {
  // Real (or mock-provider) insights available → show measured numbers only.
  if (performance && performance.measuredCount > 0) {
    const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).format(new Date());
    const count = posts.filter((p) => p.scheduledAt && new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).format(new Date(p.scheduledAt)) === month).length;
    const growth = performance.followerGrowth;
    const reach = performance.totals.reach ?? performance.totals.views;
    return {
      sns: [
        { label: "今月の投稿数", value: `${count}本`, change: `公開 ${performance.publishedCount}本/${performance.periodDays}日`, glyph: "▤", positive: true },
        { label: "フォロワー増加", value: growth === undefined ? "—" : `${growth >= 0 ? "+" : ""}${new Intl.NumberFormat("ja-JP").format(growth)}`, change: `直近${performance.periodDays}日`, glyph: "♙", positive: (growth ?? 0) >= 0 },
        { label: "リーチ", value: reach === undefined ? "—" : new Intl.NumberFormat("ja-JP").format(reach), change: `計測済み ${performance.measuredCount}投稿`, glyph: "◉", positive: true },
        { label: "エンゲージメント率", value: performance.engagementRate === undefined ? "—" : `${(performance.engagementRate * 100).toFixed(1)}%`, change: performance.insufficient ? "insufficient data" : null, glyph: "♡", positive: true },
      ],
      ads: org.isDemo ? DEMO_METRICS.ads : null,
    };
  }
  if (org.isDemo) {
    // "今月の投稿数" reflects the real planner data; the rest is demo analytics.
    const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).format(new Date());
    const count = posts.filter((p) => p.scheduledAt && new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).format(new Date(p.scheduledAt)) === month).length;
    return { ...DEMO_METRICS, sns: DEMO_METRICS.sns.map((m, i) => (i === 0 ? { ...m, value: `${count}本` } : m)) };
  }
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thisMonth = posts.filter((p) => (p.scheduledAt ?? p.createdAt) >= monthStart);
  const scheduled = posts.filter((p) => p.status === "scheduled").length;
  const drafts = posts.filter((p) => p.status === "draft").length;
  return {
    sns: [
      { label: "今月の投稿予定", value: `${thisMonth.length}本`, change: null, glyph: "▤", positive: true },
      { label: "予約済み", value: `${scheduled}本`, change: null, glyph: "◷", positive: true },
      { label: "下書き", value: `${drafts}本`, change: null, glyph: "✎", positive: true },
      { label: "リーチ・エンゲージメント", value: "—", change: null, glyph: "◉", positive: true },
    ],
    ads: null,
  };
}

export function getAdMetrics(org: Organization): MetricSummary[] | null {
  return org.isDemo ? DEMO_AD_METRICS : null;
}

export function getCampaigns(org: Organization): Campaign[] {
  return org.isDemo ? DEMO_CAMPAIGNS : [];
}
