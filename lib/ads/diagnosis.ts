/**
 * Baseline engine + funnel diagnosis + creative-fatigue detection (pure).
 *
 * Nothing is judged on a single number: every finding compares the entity
 * with its own history (7 / 14 / 30 days) and with peers (same ad set,
 * campaign, goal, creative angle), and the funnel is split into
 *   Impression → Click (CTR) → LP visit (LPV rate) → Conversion (LP CVR)
 * so the AI can say WHERE the problem most likely is.
 */
import { aggregate, change, fmtChange, fmtPct, fmtYen, windows, windowRows, type Aggregate, type WindowSet } from "./metrics";
import type { AdFinding, AdGoal, AdMetricSnapshot, EntityType, Evidence, FindingKind } from "./types";

export interface DiagnosisEntity {
  entityType: EntityType;
  id: string;
  name: string;
  campaignId: string | null;
  adSetId: string | null;
  locationId: string | null;
  goal: AdGoal;
  /** creative angle / format for peer baselines */
  angle?: string;
  format?: string | null;
  dailyBudget?: number | null;
  startedAt?: string | null;
  active: boolean;
  currency?: string;
}

export interface Baselines {
  self: WindowSet;
  adSet: Aggregate | null;
  campaign: Aggregate | null;
  account: Aggregate | null;
  goal: Aggregate | null;
  angle: Aggregate | null;
}

export interface DiagnosisInput {
  end: string; // last complete day (YYYY-MM-DD)
  entities: DiagnosisEntity[];
  snapshots: AdMetricSnapshot[];
}

const seriesOf = (snaps: AdMetricSnapshot[], type: EntityType, id: string) => snaps.filter((s) => s.entityType === type && s.entityId === id);

/** Peer baselines use the last 7 days of OTHER entities in the same group. */
export function buildBaselines(entity: DiagnosisEntity, input: DiagnosisInput): Baselines {
  const own = seriesOf(input.snapshots, entity.entityType, entity.id);
  const ads = input.entities.filter((e) => e.entityType === "ad" && e.id !== entity.id);
  const last7Of = (list: DiagnosisEntity[]) => {
    const rows = list.flatMap((e) => windowRows(seriesOf(input.snapshots, "ad", e.id), input.end, 7));
    return rows.length ? aggregate(rows) : null;
  };
  const campaignRows = entity.campaignId ? windowRows(seriesOf(input.snapshots, "campaign", entity.campaignId), input.end, 7) : [];
  const accountRows = windowRows(input.snapshots.filter((s) => s.entityType === "account"), input.end, 7);
  return {
    self: windows(own, input.end),
    adSet: entity.adSetId ? last7Of(ads.filter((a) => a.adSetId === entity.adSetId)) : null,
    campaign: campaignRows.length ? aggregate(campaignRows) : null,
    account: accountRows.length ? aggregate(accountRows) : null,
    goal: last7Of(ads.filter((a) => a.goal === entity.goal)),
    angle: entity.angle ? last7Of(ads.filter((a) => a.angle === entity.angle && a.goal === entity.goal)) : null,
  };
}

export interface FatigueResult {
  fatigued: boolean;
  score: number;
  signals: string[];
  evidence: Evidence[];
  daysRunning: number | null;
}

/** Creative fatigue = repeated exposure wearing out the creative, judged from several signals. */
export function detectFatigue(entity: DiagnosisEntity, b: Baselines): FatigueResult {
  const { last7, prev7 } = b.self;
  const signals: string[] = [];
  const evidence: Evidence[] = [];
  const freqChange = change(last7.frequency, prev7.frequency);
  const ctrChange = change(last7.ctr, prev7.ctr);
  const cpcChange = change(last7.cpc, prev7.cpc);
  const cpaChange = last7.conversions >= 3 && prev7.conversions >= 3 ? change(last7.cpa, prev7.cpa) : null;
  const cvrChange = change(last7.cvr, prev7.cvr);
  const daysRunning = entity.startedAt ? Math.floor((Date.parse(`${b.self.end}T23:59:59Z`) - Date.parse(entity.startedAt)) / 86_400_000) : null;

  const freqUp = freqChange !== null && freqChange >= 0.3 && (last7.frequency ?? 0) >= 2.5;
  const ctrDrop = ctrChange !== null && ctrChange <= -0.2;
  const cpcUp = cpcChange !== null && cpcChange >= 0.15;
  const cpaUp = cpaChange !== null && cpaChange >= 0.2;
  const longRunning = daysRunning !== null && daysRunning >= 14;
  const deliverySteady = prev7.impressions > 0 && last7.impressions >= prev7.impressions * 0.8;
  const cvrHolding = cvrChange === null || Math.abs(cvrChange) <= 0.25;

  if (freqUp) signals.push(`Frequency ${last7.frequency?.toFixed(1)}（前7日 ${prev7.frequency?.toFixed(1)}）`);
  if (ctrDrop) signals.push(`CTR ${fmtChange(ctrChange)}`);
  if (cpcUp) signals.push(`CPC ${fmtChange(cpcChange)}`);
  if (cpaUp) signals.push(`CPA ${fmtChange(cpaChange)}`);
  if (longRunning) signals.push(`配信${daysRunning}日目`);
  if (deliverySteady) signals.push("配信量は維持");
  if (cvrHolding) signals.push("CVRは大きく変化なし");
  evidence.push(
    { metric: "frequency", current: last7.frequency, baseline: prev7.frequency, changePct: freqChange, window: "直近7日 vs 前7日" },
    { metric: "ctr", current: last7.ctr, baseline: prev7.ctr, changePct: ctrChange, window: "直近7日 vs 前7日" },
    { metric: "cpc", current: last7.cpc, baseline: prev7.cpc, changePct: cpcChange, window: "直近7日 vs 前7日" },
  );
  if (cpaChange !== null) evidence.push({ metric: "cpa", current: last7.cpa, baseline: prev7.cpa, changePct: cpaChange, window: "直近7日 vs 前7日" });

  const core = [freqUp || longRunning, ctrDrop, cpcUp || cpaUp, deliverySteady, cvrHolding];
  const score = core.filter(Boolean).length / core.length;
  const fatigued = (freqUp || longRunning) && ctrDrop && (cpcUp || cpaUp) && deliverySteady && cvrHolding;
  return { fatigued, score, signals, evidence, daysRunning };
}

const goalLabels = (goal: AdGoal) =>
  goal === "recruitment" ? { cv: "応募", cvr: "応募率（Career Page CVR）", cpa: "応募単価（Application CPA）" } : { cv: "予約CV", cvr: "CVR", cpa: "CPA" };

function confidenceFrom(agg: Aggregate, signalStrength: number): number {
  const volume = Math.min(0.3, Math.log10(agg.clicks + 1) * 0.08) + (agg.conversions >= 10 ? 0.1 : agg.conversions >= 5 ? 0.05 : 0);
  return Math.round(Math.min(0.92, 0.45 + volume + signalStrength * 0.25) * 100) / 100;
}

let counter = 0;
const fid = (kind: FindingKind, id: string) => `${kind}:${id}:${counter++}`;

/** Diagnoses every active ad (and campaign delivery). Sorted by priority (1 = most urgent). */
export function diagnose(input: DiagnosisInput): AdFinding[] {
  counter = 0;
  const findings: (AdFinding & { weight: number })[] = [];
  const totalSpend = input.entities
    .filter((e) => e.entityType === "ad")
    .reduce((n, e) => n + aggregate(windowRows(seriesOf(input.snapshots, "ad", e.id), input.end, 7)).spend, 0) || 1;

  for (const e of input.entities.filter((x) => x.active)) {
    const b = buildBaselines(e, input);
    const { last7, prev7, last3 } = b.self;
    const L = goalLabels(e.goal);
    const cur = e.currency ?? "JPY";
    const base = { entityType: e.entityType, entityId: e.id, entityName: e.name, campaignId: e.campaignId, locationId: e.locationId, goal: e.goal };
    const spendShare = last7.spend / totalSpend;
    const push = (f: Omit<AdFinding, "id" | "priority" | keyof typeof base>, weight: number) =>
      findings.push({ ...base, ...f, id: fid(f.kind, e.id), priority: 0, weight: weight + spendShare });

    if (e.entityType === "campaign" || e.entityType === "ad_set") {
      if (e.dailyBudget && last3.days >= 3 && last3.spend < e.dailyBudget * 3 * 0.5) {
        push(
          {
            kind: "underdelivery",
            severity: "medium",
            type: "problem",
            stage: "delivery",
            observation: `直近3日の消化は${fmtYen(last3.spend, cur)}で、日予算${fmtYen(e.dailyBudget, cur)}×3日の${Math.round((last3.spend / (e.dailyBudget * 3)) * 100)}%です。`,
            problem: "予算を消化できていない（配信量不足）",
            possibleCause: "オーディエンスが狭い・入札/最適化イベントのCVが少ない・広告の審査/学習状態の可能性",
            evidence: [{ metric: "spend", current: last3.spend, baseline: e.dailyBudget * 3, changePct: change(last3.spend, e.dailyBudget * 3), window: "直近3日 vs 日予算" }],
            hypothesis: "配信条件（オーディエンス・最適化イベント）が厳しすぎる可能性があります。",
            recommendedAction: "Ads Managerでオーディエンスサイズと学習状況を確認してください（ターゲティング・予算の変更は担当者の判断で実施）。",
            suggestedVariable: null,
            expectedImpact: "配信量の回復",
            confidence: 0.6,
          },
          2,
        );
      }
      continue;
    }

    if (last7.impressions < 500) continue; // too little delivery to judge
    const fatigue = detectFatigue(e, b);
    const ctrChange = change(last7.ctr, prev7.ctr);
    const cvrChange = change(last7.cvr, prev7.cvr);
    const lpCvrChange = change(last7.lpCvr, prev7.lpCvr);
    const cpaChange = last7.conversions >= 3 && prev7.conversions >= 3 ? change(last7.cpa, prev7.cpa) : null;
    const cpcChange = change(last7.cpc, prev7.cpc);
    const peerCtr = b.adSet?.ctr ?? b.campaign?.ctr ?? b.goal?.ctr ?? null;
    const peerLpCvr = b.campaign?.lpCvr ?? b.goal?.lpCvr ?? null;
    const peerCpa = b.campaign?.cpa ?? b.goal?.cpa ?? null;
    const ev = (metric: string, current: number | null, baseline: number | null, window = "直近7日 vs 前7日"): Evidence => ({ metric, current, baseline, changePct: change(current, baseline), window });

    if (fatigue.fatigued) {
      push(
        {
          kind: "creative_fatigue",
          severity: fatigue.score >= 0.9 ? "high" : "medium",
          type: "problem",
          stage: "click",
          observation: `「${e.name}」は過去7日でFrequencyが${prev7.frequency?.toFixed(1) ?? "—"}→${last7.frequency?.toFixed(1) ?? "—"}へ上昇し、CTRが${Math.abs(Math.round((ctrChange ?? 0) * 100))}%低下しています。Creative fatigueの可能性があります。`,
          problem: "同じ人に繰り返し表示され、広告が見飽きられている（Creative fatigue）",
          possibleCause: `${fatigue.signals.join("・")}。CVRが維持されているため、LPではなくCreative側の問題の可能性が高いです。`,
          evidence: fatigue.evidence,
          hypothesis: "ファーストビュー（Hook）が見慣れてしまい、スクロールを止められていない。",
          recommendedAction: "現在の訴求を保ったまま、Hook違いの3案でCreative Testを行う（Creative案を作る）。",
          suggestedVariable: "hook",
          expectedImpact: "CTR +10〜20%",
          confidence: confidenceFrom(last7, fatigue.score),
        },
        6,
      );
    } else if (ctrChange !== null && ctrChange <= -0.2 && (cvrChange === null || Math.abs(cvrChange) <= 0.2)) {
      push(
        {
          kind: "ctr_drop",
          severity: ctrChange <= -0.3 ? "high" : "medium",
          type: "problem",
          stage: "click",
          observation: `CTRが直近7日平均で前7日より${Math.abs(Math.round(ctrChange * 100))}%低下（${fmtPct(prev7.ctr)}→${fmtPct(last7.ctr)}）。${L.cvr}は${cvrChange === null ? "データ不足" : `${fmtChange(cvrChange)}で維持`}。`,
          problem: "クリック前（広告そのもの）で離脱が増えている",
          possibleCause: "LP以降は維持しているため、ファーストビューのHook・ビジュアルがターゲットに刺さっていない可能性",
          evidence: [ev("ctr", last7.ctr, prev7.ctr), ev("cvr", last7.cvr, prev7.cvr), ev("ctr_vs_peer", last7.ctr, peerCtr, "直近7日 vs 同じ広告セット/キャンペーン平均")],
          hypothesis: "ファーストビューでターゲットの悩みが伝わっていない。",
          recommendedAction: "Hookだけを変えた2〜3案でCreative Testを行う。",
          suggestedVariable: "hook",
          expectedImpact: "CTR +10〜20%",
          confidence: confidenceFrom(last7, 0.6),
        },
        5,
      );
    }

    // "CTR healthy" = not falling and not far below peers → the click side is fine.
    const ctrHealthy = (ctrChange === null || ctrChange > -0.15) && (peerCtr === null || (last7.ctr ?? 0) >= peerCtr * 0.75);
    // Enough LP traffic and history that a CVR change is not noise.
    const lpVolumeOk = (last7.landingPageViews ?? 0) >= 60 && prev7.conversions >= 5;
    let lpFlagged = false;
    if (lpVolumeOk && ctrHealthy && ((lpCvrChange !== null && lpCvrChange <= -0.3) || (peerLpCvr !== null && last7.lpCvr !== null && last7.lpCvr <= peerLpCvr * 0.6))) {
      lpFlagged = true;
      push(
        {
          kind: "lp_cvr_drop",
          severity: "high",
          type: "problem",
          stage: "landing_page",
          observation: `CTRは${ctrHealthy ? "平均以上" : "低下"}（${fmtPct(last7.ctr)}）ですが、LP CVRが${lpCvrChange !== null ? `前7日比${fmtChange(lpCvrChange)}` : `平均の${Math.round(((last7.lpCvr ?? 0) / (peerLpCvr ?? 1)) * 100)}%`}（${fmtPct(last7.lpCvr)}）です。`,
          problem: "LP到達後に予約・応募まで進んでいない",
          possibleCause: "広告ではなく、LP・オファー・予約導線（フォームの手間、価格、空き枠）・広告とLPの訴求のズレの可能性",
          evidence: [ev("lp_cvr", last7.lpCvr, prev7.lpCvr), ev("lp_cvr_vs_campaign", last7.lpCvr, peerLpCvr, "直近7日 vs キャンペーン平均"), ev("ctr", last7.ctr, peerCtr, "直近7日 vs 平均")],
          hypothesis: "広告で期待したこととLPの内容（オファー・価格・予約のしやすさ）が一致していない。",
          recommendedAction: "Creativeを変える前に、LP（ファーストビュー・オファー・予約フォーム）を調査してください（Landing Page investigation）。",
          suggestedVariable: "landing_page",
          expectedImpact: `${L.cvr}の回復`,
          confidence: confidenceFrom(last7, 0.55),
        },
        7,
      );
    }

    if (cpaChange !== null && cpaChange >= 0.3) {
      const ctrUp = ctrChange !== null && ctrChange >= 0.1;
      const cause = ctrUp
        ? cpcChange !== null && cpcChange >= 0.15
          ? "CTRは改善しているがCPCが上昇。オーディエンスの競合やクリックの質が変わった可能性"
          : "CTRは改善しているがクリック後の転換が悪化。オーディエンスの質か、LP・オファー側の可能性"
        : cvrChange !== null && cvrChange <= -0.2
          ? `${L.cvr}の低下が主因。LP・オファー・予約導線の可能性`
          : "CPCの上昇が主因。Creative疲労またはオークション競合の可能性";
      push(
        {
          kind: "cpa_spike",
          severity: cpaChange >= 0.5 ? "high" : "medium",
          type: "problem",
          stage: "conversion",
          observation: `${L.cpa}が前7日より${Math.round(cpaChange * 100)}%上昇（${fmtYen(prev7.cpa, cur)}→${fmtYen(last7.cpa, cur)}）。`,
          problem: `${L.cpa}の急上昇`,
          possibleCause: cause,
          evidence: [ev("cpa", last7.cpa, prev7.cpa), ev("ctr", last7.ctr, prev7.ctr), ev("cpc", last7.cpc, prev7.cpc), ev("cvr", last7.cvr, prev7.cvr)],
          hypothesis: cause,
          recommendedAction: ctrUp ? "オーディエンスとLPを確認（変更は担当者の承認後）。Creativeは維持。" : "ファネルの悪化箇所に合わせてテストする変数を1つ決める。",
          suggestedVariable: ctrUp ? null : cvrChange !== null && cvrChange <= -0.2 ? "landing_page" : "hook",
          expectedImpact: `${L.cpa}を平均水準へ`,
          confidence: confidenceFrom(last7, 0.5),
        },
        6,
      );
    }

    // ≥1 CV/day before → 0 in 3 days is unlikely by chance (Poisson ≈5%); skip if the LP finding already explains it.
    if (!lpFlagged && prev7.conversions >= 7 && last3.conversions === 0 && last3.spend > 0) {
      push(
        {
          kind: "cv_stopped",
          severity: "high",
          type: "problem",
          stage: "conversion",
          observation: `直近3日の${L.cv}が0件です（前7日は${prev7.conversions}件、直近3日の費用${fmtYen(last3.spend, cur)}）。`,
          problem: `${L.cv}の停止`,
          possibleCause: "計測（Pixel / イベント設定）の不具合、LP・予約システムの障害、または配信先の変化の可能性",
          evidence: [ev("conversions", last3.conversions, prev7.conversions / 7 * 3, "直近3日 vs 前7日の日平均×3")],
          hypothesis: "計測またはLPに障害が起きている可能性があります。",
          recommendedAction: "まずLPと予約フォーム、Pixelイベントの発火を確認してください。",
          suggestedVariable: null,
          expectedImpact: "計測・CVの回復",
          confidence: 0.7,
        },
        9,
      );
    }

    if (last7.conversions >= 5 && peerCpa !== null && last7.cpa !== null && last7.cpa <= peerCpa * 0.8 && !fatigue.fatigued) {
      push(
        {
          kind: "winning_creative",
          severity: "low",
          type: "opportunity",
          stage: "conversion",
          observation: `「${e.name}」の${L.cpa}は${fmtYen(last7.cpa, cur)}で、キャンペーン平均${fmtYen(peerCpa, cur)}より${Math.abs(Math.round((change(last7.cpa, peerCpa) ?? 0) * 100))}%良好（${L.cv} ${last7.conversions}件）。`,
          problem: "勝ちCreative",
          possibleCause: `${e.angle ? `「${e.angle}」の切り口が` : ""}ターゲットの状況に合っている可能性`,
          evidence: [ev("cpa_vs_campaign", last7.cpa, peerCpa, "直近7日 vs キャンペーン平均"), ev("ctr", last7.ctr, peerCtr, "直近7日 vs 平均")],
          hypothesis: "勝ち要素（Hookの状況設定・ペルソナ）を別表現に展開しても同じ効果が出る。",
          recommendedAction: "勝ち要素を別表現で展開した新Creativeをテストし、学びをCreative Memoryに残す。予算配分の変更は担当者が判断。",
          suggestedVariable: "hook",
          expectedImpact: `${L.cpa}の維持・改善`,
          confidence: confidenceFrom(last7, 0.6),
        },
        3,
      );
    }
  }

  const sevW = { high: 3, medium: 2, low: 1 } as const;
  return findings
    .sort((a, b) => (b.type === "problem" ? 1 : 0) - (a.type === "problem" ? 1 : 0) || sevW[b.severity] * b.weight - sevW[a.severity] * a.weight)
    .map(({ weight: _w, ...f }, i) => ({ ...f, priority: i + 1 }));
}
