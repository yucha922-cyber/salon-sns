import "server-only";
import type { Campaign, MetricSummary, Organization, Post, Recommendation } from "@/lib/domain/types";
import { DEMO_AD_METRICS, DEMO_CAMPAIGNS, DEMO_METRICS, DEMO_RECOMMENDATIONS } from "@/lib/demo/seed";

/**
 * Analytics read model. External SNS / ad APIs are not connected yet, so:
 *   - demo organizations get the demo dataset,
 *   - real organizations get only numbers we can compute from our own data
 *     (post counts) and explicit "未連携" placeholders — never fake numbers.
 */
export function getDashboardMetrics(org: Organization, posts: Post[]): { sns: MetricSummary[]; ads: MetricSummary[] | null } {
  if (org.isDemo) return DEMO_METRICS;
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

export function getRecommendations(org: Organization): Recommendation[] {
  return org.isDemo ? DEMO_RECOMMENDATIONS : [];
}
