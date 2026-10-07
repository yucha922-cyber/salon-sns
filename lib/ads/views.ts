/**
 * View models for the ad pages ("what to do next", creative comparison).
 * Pure functions over an AdsWorkspace so pages stay thin and testable.
 */
import type { ID } from "@/lib/domain/types";
import type { ContentLearning } from "@/lib/social/types";
import { checkAdCopy, type PolicyWarning } from "./policy";
import { aggregate, addDays, change, windowRows, type Aggregate } from "./metrics";
import type { AdCampaign, AdCreativeRecord, AdFinding, AdGoal, AdRecord, AdsWorkspaceLike, Experiment, FirstPartyConversion } from "./views-types";

export type { AdsWorkspaceLike } from "./views-types";

export type GoalFilter = "all" | AdGoal;

export interface Kpi {
  key: string;
  label: string;
  value: number | null;
  previous: number | null;
  change: number | null;
  format: "yen" | "pct" | "num" | "ratio";
  /** true when an increase is good */
  higherIsBetter: boolean;
  note?: string;
}

export interface CampaignRow {
  campaign: AdCampaign;
  last7: Aggregate;
  prev7: Aggregate;
  firstParty: number;
  activeAds: number;
}

export interface AdsDashboardView {
  end: string | null;
  kpis: Kpi[];
  trend: { date: string; spend: number; conversions: number }[];
  campaigns: CampaignRow[];
  attention: AdFinding[];
  opportunities: AdFinding[];
  runningTests: Experiment[];
  firstPartyTotal: number;
}

const visibleCampaigns = (ws: AdsWorkspaceLike, goal: GoalFilter) => ws.campaigns.filter((c) => goal === "all" || c.goal === goal);

export function buildDashboard(ws: AdsWorkspaceLike, input: { goal: GoalFilter; findings: AdFinding[]; experiments: Experiment[]; conversions: FirstPartyConversion[] }): AdsDashboardView {
  const campaigns = visibleCampaigns(ws, input.goal);
  const ids = new Set(campaigns.map((c) => c.id));
  const end = ws.end;
  const rows = ws.snapshots.filter((s) => s.entityType === "campaign" && ids.has(s.entityId));
  const byDate = new Map<string, typeof rows>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  const daily = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({ date, ...aggregate(list) }));
  const last7 = end ? aggregate(windowRows(rows, end, 7)) : aggregate([]);
  const prev7 = end ? aggregate(windowRows(rows, addDays(end, -7), 7)) : aggregate([]);
  const recruitOnly = input.goal === "recruitment";
  const cvLabel = recruitOnly ? "応募" : input.goal === "acquisition" ? "予約CV" : "CV";
  const kpi = (key: string, label: string, cur: number | null, prev: number | null, format: Kpi["format"], higherIsBetter: boolean, note?: string): Kpi => ({ key, label, value: cur, previous: prev, change: change(cur, prev), format, higherIsBetter, note });
  const fpSince = end ? addDays(end, -6) : null;
  const firstPartyTotal = input.conversions
    .filter((c) => (!fpSince || (c.occurredOn >= fpSince && c.occurredOn <= (end as string))) && c.kind !== "revenue" && (!c.campaignId || ids.has(c.campaignId)))
    .reduce((n, c) => n + c.count, 0);
  const kpis: Kpi[] = [
    kpi("spend", "Spend（費用）", last7.spend, prev7.spend, "yen", false),
    kpi("cv", cvLabel, last7.conversions, prev7.conversions, "num", true, "Meta計測"),
    kpi("cpa", recruitOnly ? "応募単価" : "CPA", last7.cpa, prev7.cpa, "yen", false),
    kpi("ctr", "CTR", last7.ctr, prev7.ctr, "pct", true),
    kpi("cvr", recruitOnly ? "応募率" : "CVR", last7.cvr, prev7.cvr, "pct", true),
    last7.roas === null ? kpi("first_party", "自社計測", firstPartyTotal, null, "num", true, "予約・応募など（手入力 / CSV）") : kpi("roas", "ROAS", last7.roas, prev7.roas, "ratio", true),
  ];
  const campaignRows: CampaignRow[] = campaigns.map((c) => {
    const cr = rows.filter((r) => r.entityId === c.id);
    return {
      campaign: c,
      last7: end ? aggregate(windowRows(cr, end, 7)) : aggregate([]),
      prev7: end ? aggregate(windowRows(cr, addDays(end, -7), 7)) : aggregate([]),
      firstParty: input.conversions.filter((x) => x.campaignId === c.id && (!fpSince || x.occurredOn >= fpSince) && x.kind !== "revenue").reduce((n, x) => n + x.count, 0),
      activeAds: ws.ads.filter((a) => a.campaignId === c.id && (a.effectiveStatus ?? a.status) === "ACTIVE").length,
    };
  });
  const inGoal = (f: AdFinding) => input.goal === "all" || f.goal === input.goal;
  return {
    end,
    kpis,
    trend: daily.slice(-30).map((d) => ({ date: d.date, spend: d.spend, conversions: d.conversions })),
    campaigns: campaignRows.sort((a, b) => b.last7.spend - a.last7.spend),
    attention: input.findings.filter((f) => f.type === "problem" && inGoal(f)),
    opportunities: input.findings.filter((f) => f.type === "opportunity" && inGoal(f)),
    runningTests: input.experiments.filter((e) => (e.status === "running" || e.status === "approved" || e.status === "draft") && (input.goal === "all" || e.goal === input.goal)),
    firstPartyTotal,
  };
}

export interface CreativeRowView {
  ad: AdRecord;
  creative: AdCreativeRecord | null;
  campaign: AdCampaign | null;
  audience: string;
  metrics: Aggregate;
  days: number;
  status: string;
  testDecision: { experimentId: ID; label: string; decision: string | null } | null;
  learning: ContentLearning | null;
  policy: PolicyWarning[];
  finding: AdFinding | null;
}

/** Creative comparison: every ad with its creative, audience and the last 14 days. */
export function buildCreativeRows(ws: AdsWorkspaceLike, input: { experiments: Experiment[]; learnings: ContentLearning[]; findings: AdFinding[]; goal: GoalFilter; days?: number }): CreativeRowView[] {
  const days = input.days ?? 14;
  return ws.ads
    .map((ad): CreativeRowView => {
      const creative = ws.creatives.find((c) => c.id === ad.creativeId) ?? null;
      const campaign = ws.campaigns.find((c) => c.id === ad.campaignId) ?? null;
      const snaps = ws.snapshots.filter((s) => s.entityType === "ad" && s.entityId === ad.id);
      const metrics = ws.end ? aggregate(windowRows(snaps, ws.end, days)) : aggregate([]);
      const exp = input.experiments.find((e) => e.variants.some((v) => v.adId === ad.id));
      const variant = exp?.variants.find((v) => v.adId === ad.id);
      return {
        ad,
        creative,
        campaign,
        audience: ws.adSets.find((s) => s.id === ad.adSetId)?.audienceLabel ?? "",
        metrics,
        days: metrics.days,
        status: ad.effectiveStatus ?? ad.status,
        testDecision: exp && variant ? { experimentId: exp.id, label: `${exp.status === "completed" ? "テスト結果" : "テスト中"} ${variant.label}`, decision: exp.status === "completed" ? variant.decision : (exp.resultSummary?.decision ?? null) } : null,
        learning: input.learnings.find((l) => l.kind === "creative" && creative && l.attributes?.hook === creative.hook) ?? null,
        policy: creative ? checkAdCopy({ headline: creative.headline, primaryText: creative.primaryText, hook: creative.hook }) : [],
        finding: input.findings.find((f) => f.entityId === ad.id) ?? null,
      };
    })
    .filter((r) => input.goal === "all" || r.campaign?.goal === input.goal)
    .sort((a, b) => (a.metrics.cpa ?? Infinity) - (b.metrics.cpa ?? Infinity));
}
