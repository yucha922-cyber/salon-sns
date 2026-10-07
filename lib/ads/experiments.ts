/**
 * Winner detection (pure). Rules:
 *   - Evaluate ONLY the experiment's primary metric (CPA for acquisition,
 *     application CPA for recruitment by default) — never CTR alone.
 *   - Every variant must reach the minimums (spend, impressions, clicks,
 *     conversions, runtime) before anything is decided → "insufficient_data".
 *   - A challenger wins only if it beats control by ≥ minLiftPct AND the
 *     difference is statistically supported (two-proportion z-test on the
 *     conversion rate, or CTR for CTR tests) AND guardrails hold.
 *   - Otherwise "inconclusive". The AI never forces a winner.
 */
import { LOWER_IS_BETTER } from "./metrics";
import type { ExperimentCriteria, ExperimentDecision, ExperimentResult, PrimaryMetric, VariantDecision, VariantMetrics } from "./types";

export const DEFAULT_CRITERIA: Record<"acquisition" | "recruitment", ExperimentCriteria> = {
  acquisition: { minLiftPct: 0.15, minSpend: 30_000, minImpressions: 8_000, minClicks: 100, minConversions: 10, minDays: 7, maxFrequency: 4 },
  recruitment: { minLiftPct: 0.15, minSpend: 20_000, minImpressions: 8_000, minClicks: 80, minConversions: 8, minDays: 7, maxFrequency: 4 },
};

export const METRIC_NAMES: Record<PrimaryMetric, string> = { cpa: "CPA", application_cpa: "応募単価", cvr: "CVR", ctr: "CTR", roas: "ROAS", cpc: "CPC" };

export function metricValue(m: VariantMetrics, metric: PrimaryMetric): number | null {
  switch (metric) {
    case "cpa":
    case "application_cpa":
      return m.cpa;
    case "cvr":
      return m.cvr;
    case "ctr":
      return m.ctr;
    case "roas":
      return m.roas;
    case "cpc":
      return m.clicks ? m.spend / m.clicks : null;
  }
}

export function withDerived(m: Omit<VariantMetrics, "ctr" | "cvr" | "cpa" | "roas">): VariantMetrics {
  return {
    ...m,
    ctr: m.impressions ? m.clicks / m.impressions : null,
    cvr: m.clicks ? m.conversions / m.clicks : null,
    cpa: m.conversions ? m.spend / m.conversions : null,
    roas: m.revenue !== null && m.spend ? m.revenue / m.spend : null,
  };
}

/** Lift of challenger over control in the "better" direction (0.2 = 20% better). */
export function lift(control: number | null, challenger: number | null, metric: PrimaryMetric): number | null {
  if (control === null || challenger === null || control === 0) return null;
  return LOWER_IS_BETTER.has(metric) ? (control - challenger) / control : (challenger - control) / control;
}

/** One-sided confidence that the challenger's rate is better (normal approximation). */
export function proportionConfidence(succA: number, nA: number, succB: number, nB: number): number | null {
  if (nA < 1 || nB < 1) return null;
  const pA = succA / nA;
  const pB = succB / nB;
  const p = (succA + succB) / (nA + nB);
  const se = Math.sqrt(p * (1 - p) * (1 / nA + 1 / nB));
  if (!se) return null;
  const z = (pB - pA) / se;
  // standard normal CDF
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const tail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - tail : tail;
}

export interface EvalVariant {
  label: string;
  role: "control" | "challenger";
  metrics: VariantMetrics;
}

export function evaluateExperiment(
  input: { primaryMetric: PrimaryMetric; criteria: ExperimentCriteria; startDate: string | null; variants: EvalVariant[] },
  now: Date = new Date(),
): ExperimentResult & { variantDecisions: Record<string, VariantDecision>; confidence: number | null } {
  const { criteria: c, primaryMetric } = input;
  const control = input.variants.find((v) => v.role === "control");
  const challengers = input.variants.filter((v) => v.role === "challenger");
  const evaluatedAt = now.toISOString();
  const base = { primaryMetric, evaluatedAt };
  const decisions: Record<string, VariantDecision> = {};
  if (!control || !challengers.length) {
    input.variants.forEach((v) => (decisions[v.label] = "insufficient_data"));
    return { ...base, decision: "insufficient_data", winnerLabel: null, liftPct: null, reasons: ["ControlとChallengerが揃っていません"], missing: ["variants"], variantDecisions: decisions, confidence: null };
  }

  const days = input.startDate ? Math.floor((now.getTime() - Date.parse(`${input.startDate}T00:00:00Z`)) / 86_400_000) : 0;
  const missing: string[] = [];
  if (days < c.minDays) missing.push(`実施期間 ${days}/${c.minDays}日`);
  for (const v of [control, ...challengers]) {
    const m = v.metrics;
    if (m.spend < c.minSpend) missing.push(`${v.label}: 費用 ¥${Math.round(m.spend).toLocaleString()}/¥${c.minSpend.toLocaleString()}`);
    if (m.impressions < c.minImpressions) missing.push(`${v.label}: 表示 ${m.impressions.toLocaleString()}/${c.minImpressions.toLocaleString()}`);
    if (m.clicks < c.minClicks) missing.push(`${v.label}: クリック ${m.clicks}/${c.minClicks}`);
    if (m.conversions < c.minConversions) missing.push(`${v.label}: CV ${m.conversions}/${c.minConversions}`);
  }
  if (missing.length) {
    input.variants.forEach((v) => (decisions[v.label] = "insufficient_data"));
    return {
      ...base,
      decision: "insufficient_data",
      winnerLabel: null,
      liftPct: null,
      reasons: ["まだ判断材料が不足しています。最低条件を満たすまで勝者は決めません。"],
      missing,
      variantDecisions: decisions,
      confidence: null,
    };
  }

  const ctrTest = primaryMetric === "ctr";
  const scored = challengers.map((ch) => {
    const l = lift(metricValue(control.metrics, primaryMetric), metricValue(ch.metrics, primaryMetric), primaryMetric);
    const conf = ctrTest
      ? proportionConfidence(control.metrics.clicks, control.metrics.impressions, ch.metrics.clicks, ch.metrics.impressions)
      : proportionConfidence(control.metrics.conversions, control.metrics.clicks, ch.metrics.conversions, ch.metrics.clicks);
    return { ch, lift: l, conf };
  });
  const best = scored.filter((s) => s.lift !== null).sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))[0];
  const reasons: string[] = [];
  const guardrailOk = (m: VariantMetrics) => m.frequency === null || m.frequency <= c.maxFrequency;

  if (best && (best.lift ?? 0) >= c.minLiftPct && (best.conf ?? 0) >= 0.8 && guardrailOk(best.ch.metrics)) {
    decisions[best.ch.label] = "winner";
    decisions[control.label] = "loser";
    scored.filter((s) => s !== best).forEach((s) => (decisions[s.ch.label] = (s.lift ?? 0) >= c.minLiftPct ? "inconclusive" : "loser"));
    reasons.push(`${best.ch.label}が${METRIC_NAMES[primaryMetric] ?? primaryMetric}でControlより${Math.round((best.lift ?? 0) * 100)}%良く、基準（${Math.round(c.minLiftPct * 100)}%以上）を満たしました（確度${Math.round((best.conf ?? 0) * 100)}%）。`);
    return { ...base, decision: "winner", winnerLabel: best.ch.label, liftPct: best.lift, reasons, missing: [], variantDecisions: decisions, confidence: best.conf };
  }
  // Control clearly better than every challenger → control is the winner.
  const allWorse = scored.every((s) => s.lift !== null && s.lift <= -c.minLiftPct && 1 - (s.conf ?? 1) >= 0.8);
  if (allWorse) {
    decisions[control.label] = "winner";
    scored.forEach((s) => (decisions[s.ch.label] = "loser"));
    reasons.push(`Controlがすべてのチャレンジャーより${Math.round(c.minLiftPct * 100)}%以上良い結果でした。仮説は支持されませんでした。`);
    return { ...base, decision: "winner", winnerLabel: control.label, liftPct: Math.min(...scored.map((s) => s.lift ?? 0)), reasons, missing: [], variantDecisions: decisions, confidence: Math.min(...scored.map((s) => 1 - (s.conf ?? 1))) };
  }
  input.variants.forEach((v) => (decisions[v.label] = "inconclusive"));
  if (best && (best.lift ?? 0) >= c.minLiftPct && (best.conf ?? 0) < 0.8) reasons.push(`${best.ch.label}は${Math.round((best.lift ?? 0) * 100)}%良いものの、差が偶然の範囲を超えていません（確度${Math.round((best.conf ?? 0) * 100)}%）。`);
  else if (best && !guardrailOk(best.ch.metrics)) reasons.push(`${best.ch.label}はFrequencyがガードレール（${c.maxFrequency}）を超えています。`);
  else reasons.push(`差が基準（${Math.round(c.minLiftPct * 100)}%）未満でした。`);
  return { ...base, decision: "inconclusive" as ExperimentDecision, winnerLabel: null, liftPct: best?.lift ?? null, reasons, missing: [], variantDecisions: decisions, confidence: best?.conf ?? null };
}
