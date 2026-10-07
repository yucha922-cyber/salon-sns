import "server-only";
import { getAIProvider } from "@/lib/ai";
import type { GenerateObjectRequest } from "@/lib/ai/provider";
import { buildAdNarrativeRequest } from "@/lib/ai/prompts/ads-loop";
import type { DataRepository } from "@/lib/data/repository";
import type { BrandBrainInput, ID, RecommendationInput } from "@/lib/domain/types";
import { diagnose, type DiagnosisEntity } from "./diagnosis";
import { logAdsEvent } from "./events";
import { addDays } from "./metrics";
import type { AdsStore } from "./store";
import type { AdCampaign, AdCreativeRecord, AdFinding, AdMetricSnapshot, AdRecord, AdSetRecord, AiAdAnalysis, CreativeHypothesis, PrimaryMetric } from "./types";

/** Everything the dashboard / analysis needs, loaded once. */
export interface AdsWorkspace {
  campaigns: AdCampaign[];
  adSets: AdSetRecord[];
  ads: AdRecord[];
  creatives: AdCreativeRecord[];
  snapshots: AdMetricSnapshot[];
  /** last day with data (the engine's "yesterday") */
  end: string | null;
}

export async function loadAdsWorkspace(store: AdsStore, organizationId: ID, options: { days?: number; today?: string } = {}): Promise<AdsWorkspace> {
  const since = addDays(options.today ?? new Date().toISOString().slice(0, 10), -(options.days ?? 62));
  const [campaigns, adSets, ads, creatives, snapshots] = await Promise.all([
    store.listCampaigns(organizationId),
    store.listAdSets(organizationId),
    store.listAds(organizationId),
    store.listCreatives(organizationId),
    store.listSnapshots(organizationId, { since }),
  ]);
  const end = snapshots.reduce<string | null>((m, s) => (m === null || s.date > m ? s.date : m), null);
  return { campaigns, adSets, ads, creatives, snapshots, end };
}

const ACTIVE = (s: string | null | undefined) => !s || s === "ACTIVE";

export function diagnosisEntities(ws: AdsWorkspace): DiagnosisEntity[] {
  const campaignOf = new Map(ws.campaigns.map((c) => [c.id, c]));
  const creativeOf = new Map(ws.creatives.map((c) => [c.id, c]));
  return [
    ...ws.ads.map((a): DiagnosisEntity => {
      const c = a.campaignId ? campaignOf.get(a.campaignId) : undefined;
      const cr = a.creativeId ? creativeOf.get(a.creativeId) : undefined;
      return {
        entityType: "ad",
        id: a.id,
        name: a.name,
        campaignId: a.campaignId,
        adSetId: a.adSetId,
        locationId: a.locationId,
        goal: c?.goal ?? "acquisition",
        angle: cr?.angle || undefined,
        format: cr?.format ?? null,
        startedAt: a.providerCreatedAt,
        active: ACTIVE(a.effectiveStatus ?? a.status) && ACTIVE(c?.effectiveStatus ?? c?.status),
        currency: c?.currency,
      };
    }),
    ...ws.campaigns.map(
      (c): DiagnosisEntity => ({
        entityType: "campaign",
        id: c.id,
        name: c.name,
        campaignId: c.id,
        adSetId: null,
        locationId: c.locationId,
        goal: c.goal,
        dailyBudget: c.dailyBudget,
        active: ACTIVE(c.effectiveStatus ?? c.status),
        currency: c.currency,
      }),
    ),
  ];
}

export function findingsFor(ws: AdsWorkspace, filter: (f: AdFinding) => boolean = () => true): AdFinding[] {
  if (!ws.end) return [];
  return diagnose({ end: ws.end, entities: diagnosisEntities(ws), snapshots: ws.snapshots }).filter(filter);
}

export const primaryMetricFor = (goal: AdCampaign["goal"]): PrimaryMetric => (goal === "recruitment" ? "application_cpa" : "cpa");

/** AI call with a deterministic fallback: analysis must never fail because a model is down. */
export async function generateOrFallback<T>(request: GenerateObjectRequest<T>): Promise<{ object: T; provider: string }> {
  const ai = getAIProvider();
  try {
    const { object } = await ai.generateStructuredObject(request);
    return { object, provider: ai.name };
  } catch (error) {
    console.error("[ads] AI generation failed, using rule-based output", error instanceof Error ? error.message : error);
    return { object: request.mockResponse(), provider: "rules" };
  }
}

export interface AnalysisDeps {
  store: AdsStore;
  repo: DataRepository;
  brain: BrandBrainInput;
  organizationId: ID;
  actorUserId: ID | null;
  /** null = all locations the caller can see */
  locationIds: ID[] | null;
}

export interface AnalysisResult {
  analysis: AiAdAnalysis | null;
  hypotheses: CreativeHypothesis[];
  recommendations: number;
}

/**
 * 問題検知 → 原因仮説 → Creative仮説. Saves the analysis, opens hypotheses
 * (one per ad × variable, never duplicated while one is still open) and
 * dashboard recommendations. Nothing is changed on Meta.
 */
export async function runAdAnalysis(deps: AnalysisDeps, options: { locationId?: ID | null; campaignId?: ID | null } = {}): Promise<AnalysisResult> {
  const { store, organizationId } = deps;
  const ws = await loadAdsWorkspace(store, organizationId);
  if (!ws.end) return { analysis: null, hypotheses: [], recommendations: 0 };
  const visible = (loc: ID | null) => deps.locationIds === null || (loc !== null && deps.locationIds.includes(loc));
  const findings = findingsFor(
    ws,
    (f) => visible(f.locationId) && (options.locationId === undefined || options.locationId === null || f.locationId === options.locationId) && (!options.campaignId || f.campaignId === options.campaignId),
  );
  const periodStart = addDays(ws.end, -6);
  const { object: narrative, provider } = await generateOrFallback(buildAdNarrativeRequest(deps.brain, findings, { start: periodStart, end: ws.end }));
  const byId = new Map(narrative.items.map((i) => [i.findingId, i]));

  const analysis = await store.addAnalysis({
    organizationId,
    locationId: options.locationId ?? null,
    campaignId: options.campaignId ?? null,
    periodStart,
    periodEnd: ws.end,
    summary: narrative.summary,
    findings,
    aiProvider: provider,
    createdBy: deps.actorUserId,
  });
  await logAdsEvent(organizationId, {
    type: "ad_analysis_generated",
    message: `AI広告分析を作成しました（${findings.length}件の検知）`,
    locationId: options.locationId ?? null,
    details: { analysisId: analysis.id, findings: findings.length },
    actorUserId: deps.actorUserId,
  });

  // ---- Creative hypotheses (ads only, one open hypothesis per ad × variable)
  const existing = await store.listHypotheses(organizationId);
  const open = existing.filter((h) => h.status === "proposed" || h.status === "accepted" || h.status === "in_test");
  const adOf = new Map(ws.ads.map((a) => [a.id, a]));
  const toCreate = findings.filter((f) => f.entityType === "ad" && f.suggestedVariable && !open.some((h) => h.adId === f.entityId && h.changeVariable === f.suggestedVariable));
  const created = await store.addHypotheses(
    toCreate.map((f) => {
      const n = byId.get(f.id);
      return {
        organizationId,
        locationId: f.locationId,
        analysisId: analysis.id,
        campaignId: f.campaignId,
        adSetId: adOf.get(f.entityId)?.adSetId ?? null,
        adId: f.entityId,
        goal: f.goal,
        problem: `${f.problem}：${f.observation}`,
        hypothesis: f.hypothesis,
        changeVariable: f.suggestedVariable as CreativeHypothesis["changeVariable"],
        testIdea: n?.testIdea ?? f.recommendedAction,
        expectedResult: n?.expectedResult ?? f.expectedImpact,
        primaryMetric: primaryMetricFor(f.goal),
        confidence: f.confidence,
      };
    }),
  );
  if (created.length) {
    await logAdsEvent(organizationId, {
      type: "hypothesis_generated",
      message: `Creative仮説を${created.length}件作成しました`,
      details: { analysisId: analysis.id, count: created.length },
      actorUserId: deps.actorUserId,
    });
  }

  // ---- Dashboard recommendations ("what to do next")
  const hypothesisFor = (f: AdFinding) => [...created, ...open].find((h) => h.adId === f.entityId && h.changeVariable === f.suggestedVariable) ?? null;
  const pending = (await deps.repo.listRecommendations(organizationId)).filter((r) => r.source === "ads" && r.status === "pending");
  const recs: RecommendationInput[] = findings
    .filter((f) => !pending.some((r) => r.payload?.findingKind === f.kind && r.payload?.entityId === f.entityId))
    .slice(0, 8)
    .map((f) => {
      const h = hypothesisFor(f);
      return {
        locationId: f.locationId,
        socialAccountId: null,
        category: f.goal === "recruitment" ? "recruitment" : f.suggestedVariable && f.suggestedVariable !== "landing_page" ? "creative" : "ads",
        severity: f.severity,
        title: `${f.entityName}：${f.problem}`,
        observation: f.observation,
        insight: f.possibleCause,
        hypothesis: f.hypothesis,
        recommendedAction: byId.get(f.id)?.testIdea ?? f.recommendedAction,
        expectedImpact: f.expectedImpact,
        confidence: f.confidence,
        source: "ads",
        payload: {
          findingKind: f.kind,
          entityType: f.entityType,
          entityId: f.entityId,
          campaignId: f.campaignId,
          hypothesisId: h?.id ?? null,
          variable: f.suggestedVariable,
          priority: f.priority,
          analysisId: analysis.id,
        },
      };
    });
  if (recs.length) {
    await deps.repo.createRecommendations(organizationId, recs);
    await logAdsEvent(organizationId, { type: "recommendation_generated", message: `広告の改善提案を${recs.length}件作成しました`, details: { analysisId: analysis.id, count: recs.length }, actorUserId: deps.actorUserId });
  }
  return { analysis, hypotheses: created, recommendations: recs.length };
}
