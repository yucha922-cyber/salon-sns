import "server-only";
import type { BrandBrainInput, ID } from "@/lib/domain/types";
import { addDays as addDateDays } from "./metrics";
import type { SocialStore } from "@/lib/social/store";
import { SocialApiError } from "@/lib/social/errors";
import { principleOf } from "./creative-memory";
import { logAdsEvent } from "./events";
import { DEFAULT_CRITERIA, evaluateExperiment, withDerived } from "./experiments";
import { aggregate } from "./metrics";
import { getAdsProvider } from "./registry";
import { AdsStoreError, type AdsStore } from "./store";
import { lastCompleteDay } from "./sync";
import type { Experiment, ExperimentResult, ExperimentVariant, VariantDecision } from "./types";

/**
 * A/B creative test lifecycle (MVP = one ad per variant inside the SAME
 * existing ad set; budget and targeting are never touched):
 *
 *   draft      AI/human assembled control + approved challengers
 *   approved   a human approved the test plan
 *   (launch)   FINAL confirmation by an owner / admin / location manager →
 *              creatives + ads are created on Meta (ACTIVE, or PAUSED to start later)
 *   running    metrics refresh daily; the engine evaluates but never decides alone
 *   completed  a human confirms the result → winner / inconclusive / insufficient_data,
 *              Creative Learning saved to Creative Memory
 *
 * Note: ads in one ad set are not a randomized split (Meta's delivery
 * optimizes between them). That is accepted for creative tests in the MVP and
 * shown in the UI; a strict split test needs ad_studies with separate ad sets.
 */
export interface ExperimentDeps {
  store: AdsStore;
  social: SocialStore | null;
  brain: BrandBrainInput;
  organizationId: ID;
  actorUserId: ID | null;
  isDemo: boolean;
}

const now = () => new Date().toISOString();

async function mustGet(deps: ExperimentDeps, id: ID): Promise<Experiment> {
  const e = await deps.store.getExperiment(deps.organizationId, id);
  if (!e) throw new AdsStoreError("テストが見つかりません", "not_found");
  return e;
}

export async function createExperimentDraft(deps: ExperimentDeps, input: { hypothesisId: ID; challengerCreativeIds: ID[] }): Promise<Experiment> {
  const { store, organizationId } = deps;
  const hypothesis = (await store.listHypotheses(organizationId)).find((h) => h.id === input.hypothesisId);
  if (!hypothesis) throw new AdsStoreError("仮説が見つかりません", "not_found");
  if (hypothesis.status === "in_test") throw new AdsStoreError("この仮説は既にテスト中です", "conflict");
  if (!input.challengerCreativeIds.length || input.challengerCreativeIds.length > 2) throw new AdsStoreError("Challengerは1〜2案を選んでください（1テスト＝1変数・少数案）", "conflict");
  const [ads, creatives, campaigns] = await Promise.all([store.listAds(organizationId), store.listCreatives(organizationId), store.listCampaigns(organizationId)]);
  const controlAd = ads.find((a) => a.id === hypothesis.adId);
  if (!controlAd) throw new AdsStoreError("Controlとなる現行広告が見つかりません", "not_found");
  const challengers = input.challengerCreativeIds.map((id) => creatives.find((c) => c.id === id));
  if (challengers.some((c) => !c || c.status !== "approved" || c.hypothesisId !== hypothesis.id)) {
    throw new AdsStoreError("承認済み（Approve済み）のCreativeだけをテストに使えます", "conflict");
  }
  const busy = (await store.listExperiments(organizationId)).find((x) => x.adSetId === controlAd.adSetId && (x.status === "running" || x.status === "approved" || x.status === "draft"));
  if (busy) throw new AdsStoreError(`同じ広告セットで進行中のテスト「${busy.name}」があります。結果が混ざらないよう、完了または中止してから作成してください。`, "conflict");
  const campaign = campaigns.find((c) => c.id === controlAd.campaignId);
  const goal = campaign?.goal ?? hypothesis.goal;
  const zero = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: null, frequency: null, ctr: null, cvr: null, cpa: null, roas: null };
  const experiment = await store.createExperiment({
    organizationId,
    locationId: hypothesis.locationId,
    campaignId: controlAd.campaignId,
    adSetId: controlAd.adSetId,
    hypothesisId: hypothesis.id,
    name: `${campaign?.name ?? ""}｜${hypothesis.changeVariable}テスト`,
    goal,
    variable: hypothesis.changeVariable,
    hypothesis: hypothesis.hypothesis,
    primaryMetric: hypothesis.primaryMetric,
    secondaryMetrics: goal === "recruitment" ? ["ctr", "cvr", "conversions"] : ["ctr", "cvr", "conversions"],
    criteria: DEFAULT_CRITERIA[goal],
    status: "draft",
    startDate: null,
    endDate: null,
    createdBy: deps.actorUserId,
    variants: [
      { role: "control", label: "A", creativeId: controlAd.creativeId, adId: controlAd.id, providerAdId: controlAd.externalId, variableChanged: "", ...zero },
      ...challengers.map((c, i) => ({ role: "challenger" as const, label: i === 0 ? "B" : "C", creativeId: c?.id ?? null, adId: null, providerAdId: null, variableChanged: `${hypothesis.changeVariable}: ${c?.hook ?? ""}`, ...zero })),
    ],
  });
  await logAdsEvent(organizationId, { type: "experiment_created", message: `A/Bテスト案を作成しました：${experiment.name}`, locationId: experiment.locationId, details: { experimentId: experiment.id, hypothesisId: hypothesis.id }, actorUserId: deps.actorUserId });
  return experiment;
}

export async function approveExperiment(deps: ExperimentDeps, experimentId: ID): Promise<Experiment> {
  const updated = await deps.store.updateExperiment(deps.organizationId, experimentId, { status: "approved", approvedBy: deps.actorUserId, approvedAt: now() }, { statuses: ["draft"] });
  if (!updated) throw new AdsStoreError("下書きのテストだけ承認できます", "conflict");
  await logAdsEvent(deps.organizationId, { type: "experiment_approved", message: `A/Bテストのプランを承認しました：${updated.name}`, locationId: updated.locationId, details: { experimentId }, actorUserId: deps.actorUserId });
  return updated;
}

/**
 * FINAL confirmation → Meta. Caller must have checked assertCanOperateAds.
 * start=false creates the ads PAUSED (the human starts them later).
 */
export async function launchExperiment(deps: ExperimentDeps, experimentId: ID, options: { start: boolean }): Promise<Experiment> {
  const { store, organizationId } = deps;
  const e = await mustGet(deps, experimentId);
  if (e.status !== "approved" || e.launchedAt) throw new AdsStoreError("承認済みで未反映のテストだけをMetaへ反映できます", "conflict");
  if (e.variable === "visual" || e.variable === "format") {
    throw new AdsStoreError("Visual / Formatのテストは、新しい画像・動画をアップロードしてから反映してください（MVPではコピー系の変数のみ自動作成します）", "conflict");
  }
  const [adSets, campaigns, accounts] = await Promise.all([store.listAdSets(organizationId), store.listCampaigns(organizationId), store.listAdAccounts(organizationId)]);
  const adSet = adSets.find((s) => s.id === e.adSetId);
  const campaign = campaigns.find((c) => c.id === e.campaignId);
  const account = accounts.find((a) => a.id === campaign?.adAccountId);
  if (!adSet?.externalId || !campaign || !account) throw new AdsStoreError("広告セット / 広告アカウントが見つかりません", "not_found");
  if (account.connectionStatus !== "connected") throw new AdsStoreError("広告アカウントの再接続が必要です", "conflict");
  const credential = await store.getAdCredential(organizationId, account.id);
  if (!credential) throw new AdsStoreError("広告アカウントの認証情報がありません。再接続してください。", "conflict");
  // Claim the launch (compare-and-set) so a double click cannot create ads twice.
  const claimed = await store.updateExperiment(organizationId, e.id, { launchedBy: deps.actorUserId, launchedAt: now() }, { statuses: ["approved"], notLaunched: true });
  if (!claimed) throw new AdsStoreError("このテストは既に反映処理中です", "conflict");

  const provider = getAdsProvider({ isDemoOrganization: deps.isDemo, account });
  const ctx = { accessToken: credential.accessToken, accountExternalId: account.externalAccountId };
  const control = e.variants.find((v) => v.role === "control");
  const controlCreative = control?.creativeId ? await store.getCreative(organizationId, control.creativeId) : null;
  try {
    const challengers = e.variants.filter((v) => v.role === "challenger");
    const prepared: { variant: ExperimentVariant; creativeExternalId: string; name: string }[] = [];
    for (const v of challengers) {
      const c = v.creativeId ? await store.getCreative(organizationId, v.creativeId) : null;
      if (!c || c.status !== "approved") throw new AdsStoreError(`${v.label}のCreativeが承認されていません`, "conflict");
      const { externalId } = await provider.createCreativeDraft(ctx, {
        name: `[NAORU AI] ${e.name} ${v.label}`,
        pageId: null,
        headline: c.headline,
        primaryText: c.primaryText,
        description: "",
        callToActionType: c.cta || "LEARN_MORE",
        linkUrl: c.landingPageUrl ?? campaign.landingPageUrl ?? "",
        // 1 test = 1 variable: copy tests reuse the control's visual.
        imageUrl: controlCreative?.thumbnailUrl ?? c.thumbnailUrl,
      });
      await store.updateCreative(organizationId, c.id, { externalId, adAccountId: account.id });
      prepared.push({ variant: v, creativeExternalId: externalId, name: `${v.label}｜${c.hook}`.slice(0, 120) });
    }
    const created = await provider.createExperiment(ctx, {
      adSetExternalId: adSet.externalId,
      variants: prepared.map((p) => ({ label: p.variant.label, creativeExternalId: p.creativeExternalId, name: p.name })),
      start: options.start,
    });
    for (const p of prepared) {
      const out = created.find((x) => x.label === p.variant.label);
      if (!out) continue;
      const ad = await store.createAdRecord(organizationId, {
        campaignId: campaign.id,
        adSetId: adSet.id,
        creativeId: p.variant.creativeId,
        locationId: adSet.locationId ?? campaign.locationId,
        externalId: out.externalAdId,
        name: p.name,
        status: options.start ? "ACTIVE" : "PAUSED",
        effectiveStatus: options.start ? "ACTIVE" : "PAUSED",
        landingPageUrl: campaign.landingPageUrl,
        providerCreatedAt: now(),
      });
      await store.updateVariant(organizationId, p.variant.id, { adId: ad.id, providerAdId: out.externalAdId });
      if (p.variant.creativeId) await store.updateCreative(organizationId, p.variant.creativeId, { status: "published" });
    }
  } catch (error) {
    // Release the claim so the human can retry after fixing the cause.
    await store.updateExperiment(organizationId, e.id, { launchedBy: null, launchedAt: null }, { statuses: ["approved"] });
    await logAdsEvent(organizationId, {
      type: "experiment_started",
      level: "error",
      message: `Metaへの反映に失敗しました：${error instanceof SocialApiError ? error.userMessage : error instanceof Error ? error.message : "unknown"}`,
      locationId: e.locationId,
      details: { experimentId: e.id },
      actorUserId: deps.actorUserId,
    });
    throw error;
  }
  const today = lastCompleteDay(account.timezone);
  const started = options.start
    ? await store.updateExperiment(organizationId, e.id, { status: "running", startDate: addDateDays(today, 1) }, { statuses: ["approved"] })
    : await mustGet(deps, e.id);
  if (e.hypothesisId) await store.updateHypothesis(organizationId, e.hypothesisId, { status: "in_test" });
  await logAdsEvent(organizationId, {
    type: "experiment_started",
    message: options.start ? `A/Bテストを開始しました（Metaに広告を作成・配信開始）：${e.name}` : `A/Bテストの広告を停止状態でMetaに作成しました：${e.name}`,
    locationId: e.locationId,
    details: { experimentId: e.id, start: options.start },
    actorUserId: deps.actorUserId,
  });
  return started ?? (await mustGet(deps, e.id));
}

/** Starts ads that were created PAUSED (explicit human action). */
export async function activateExperiment(deps: ExperimentDeps, experimentId: ID): Promise<Experiment> {
  const e = await mustGet(deps, experimentId);
  if (e.status !== "approved" || !e.launchedAt) throw new AdsStoreError("停止状態で作成済みのテストだけを開始できます", "conflict");
  const { provider, ctx, account } = await providerFor(deps, e);
  for (const v of e.variants.filter((x) => x.role === "challenger" && x.providerAdId)) {
    await provider.activateAd(ctx, v.providerAdId as string);
    if (v.adId) await deps.store.updateAd(deps.organizationId, v.adId, { status: "ACTIVE", effectiveStatus: "ACTIVE" });
    await logAdsEvent(deps.organizationId, { type: "ad_activated", message: `広告 ${v.label} の配信を開始しました（承認者の操作）`, locationId: e.locationId, details: { experimentId: e.id, adId: v.adId }, actorUserId: deps.actorUserId });
  }
  const updated = await deps.store.updateExperiment(deps.organizationId, e.id, { status: "running", startDate: addDateDays(lastCompleteDay(account.timezone), 1) }, { statuses: ["approved"] });
  return updated ?? e;
}

async function providerFor(deps: ExperimentDeps, e: Experiment) {
  const [campaigns, accounts] = await Promise.all([deps.store.listCampaigns(deps.organizationId), deps.store.listAdAccounts(deps.organizationId)]);
  const account = accounts.find((a) => a.id === campaigns.find((c) => c.id === e.campaignId)?.adAccountId);
  if (!account) throw new AdsStoreError("広告アカウントが見つかりません", "not_found");
  const credential = await deps.store.getAdCredential(deps.organizationId, account.id);
  if (!credential) throw new AdsStoreError("広告アカウントの認証情報がありません。再接続してください。", "conflict");
  return { provider: getAdsProvider({ isDemoOrganization: deps.isDemo, account }), ctx: { accessToken: credential.accessToken, accountExternalId: account.externalAccountId }, account };
}

/** Variant metrics = sum of the ad's daily snapshots since the test started; then evaluate (provisional). */
export async function refreshExperiment(store: AdsStore, organizationId: ID, experimentId: ID, at: Date = new Date()): Promise<Experiment | null> {
  const e = await store.getExperiment(organizationId, experimentId);
  if (!e || e.status !== "running" || !e.startDate) return e;
  const adIds = e.variants.map((v) => v.adId).filter((x): x is string => !!x);
  const snaps = await store.listSnapshots(organizationId, { entityType: "ad", entityIds: adIds, since: e.startDate });
  const until = e.endDate;
  const updatedVariants: ExperimentVariant[] = [];
  for (const v of e.variants) {
    const rows = snaps.filter((s) => s.entityId === v.adId && (!until || s.date <= until));
    const a = aggregate(rows);
    const m = withDerived({ spend: a.spend, impressions: a.impressions, clicks: a.clicks, conversions: a.conversions, revenue: a.revenue, frequency: a.frequency });
    await store.updateVariant(organizationId, v.id, { ...m, metricsUpdatedAt: at.toISOString() });
    updatedVariants.push({ ...v, ...m });
  }
  const result = evaluateExperiment({ primaryMetric: e.primaryMetric, criteria: e.criteria, startDate: e.startDate, variants: updatedVariants.map((v) => ({ label: v.label, role: v.role, metrics: v })) }, at);
  for (const v of updatedVariants) await store.updateVariant(organizationId, v.id, { decision: result.variantDecisions[v.label] ?? null });
  const summary: ExperimentResult = { decision: result.decision, winnerLabel: result.winnerLabel, reasons: result.reasons, liftPct: result.liftPct, primaryMetric: result.primaryMetric, missing: result.missing, evaluatedAt: result.evaluatedAt };
  return store.updateExperiment(organizationId, e.id, { resultSummary: summary }, { statuses: ["running"] });
}

/**
 * Human confirms the result. The decision is the engine's (a human cannot
 * force a winner the data doesn't support); pauseLosers is an explicit,
 * separately approved Meta action.
 */
export async function completeExperiment(deps: ExperimentDeps, experimentId: ID, options: { pauseLosers: boolean }): Promise<Experiment> {
  const { store, organizationId } = deps;
  let e = await refreshExperiment(store, organizationId, experimentId);
  if (!e) throw new AdsStoreError("テストが見つかりません", "not_found");
  if (e.status !== "running") throw new AdsStoreError("実施中のテストだけ完了できます", "conflict");
  const result = e.resultSummary;
  if (!result) throw new AdsStoreError("評価結果がありません", "conflict");
  const decisions = Object.fromEntries(e.variants.map((v) => [v.label, v.decision])) as Record<string, VariantDecision | null>;
  const winner = result.winnerLabel ? e.variants.find((v) => v.label === result.winnerLabel) : null;
  const completed = await store.updateExperiment(
    organizationId,
    e.id,
    { status: "completed", decision: result.decision, winnerVariantId: winner?.id ?? null, endDate: e.endDate ?? lastCompleteDay("Asia/Tokyo"), completedBy: deps.actorUserId, completedAt: now() },
    { statuses: ["running"] },
  );
  if (!completed) throw new AdsStoreError("このテストは既に完了しています", "conflict");
  e = completed;
  await logAdsEvent(organizationId, { type: "experiment_completed", message: `A/Bテストを完了しました：${e.name}（${result.decision}）`, locationId: e.locationId, details: { experimentId: e.id, decision: result.decision }, actorUserId: deps.actorUserId });

  if (e.hypothesisId) {
    const status = result.decision === "winner" ? (winner?.role === "challenger" ? "validated" : "invalidated") : "accepted";
    await store.updateHypothesis(organizationId, e.hypothesisId, { status });
  }
  if (result.decision === "winner" && winner) {
    await logAdsEvent(organizationId, { type: "winner_selected", message: `勝者: ${winner.label}（${result.reasons[0] ?? ""}）`, locationId: e.locationId, details: { experimentId: e.id, winner: winner.label }, actorUserId: deps.actorUserId });
    await saveCreativeLearning(deps, e, winner, result);
  }
  if (options.pauseLosers) {
    const losers = e.variants.filter((v) => decisions[v.label] === "loser" && v.providerAdId);
    if (losers.length) {
      const { provider, ctx } = await providerFor(deps, e);
      for (const v of losers) {
        await provider.pauseAd(ctx, v.providerAdId as string);
        if (v.adId) await store.updateAd(organizationId, v.adId, { status: "PAUSED", effectiveStatus: "PAUSED" });
        await logAdsEvent(organizationId, { type: "ad_paused", message: `負けた広告 ${v.label} を停止しました（承認者の操作）`, locationId: e.locationId, details: { experimentId: e.id, adId: v.adId }, actorUserId: deps.actorUserId });
      }
    }
  }
  return (await mustGet(deps, e.id)) as Experiment;
}

export async function cancelExperiment(deps: ExperimentDeps, experimentId: ID): Promise<Experiment> {
  const e = await mustGet(deps, experimentId);
  if (e.status === "completed" || e.status === "cancelled") throw new AdsStoreError("完了・中止済みです", "conflict");
  if (e.launchedAt) {
    // Ads exist on Meta: pause the challengers (the control keeps running as before).
    const { provider, ctx } = await providerFor(deps, e);
    for (const v of e.variants.filter((x) => x.role === "challenger" && x.providerAdId)) {
      await provider.pauseAd(ctx, v.providerAdId as string);
      if (v.adId) await deps.store.updateAd(deps.organizationId, v.adId, { status: "PAUSED", effectiveStatus: "PAUSED" });
    }
  }
  const updated = await deps.store.updateExperiment(deps.organizationId, e.id, { status: "cancelled", completedBy: deps.actorUserId, completedAt: now() }, { statuses: [e.status] });
  if (e.hypothesisId) await deps.store.updateHypothesis(deps.organizationId, e.hypothesisId, { status: "accepted" });
  await logAdsEvent(deps.organizationId, { type: "experiment_cancelled", message: `A/Bテストを中止しました：${e.name}`, locationId: e.locationId, details: { experimentId: e.id }, actorUserId: deps.actorUserId });
  return updated ?? e;
}

const METRIC_LABEL: Record<string, string> = { cpa: "CPA", application_cpa: "応募単価", ctr: "CTR", cvr: "CVR", roas: "ROAS", cpc: "CPC" };

/** Experiment → Creative Memory (content_learnings kind=creative). */
export async function saveCreativeLearning(deps: ExperimentDeps, e: Experiment, winner: ExperimentVariant, result: ExperimentResult): Promise<void> {
  if (!deps.social) return;
  const others = e.variants.filter((v) => v.id !== winner.id);
  const [wc, ...oc] = await Promise.all([winner, ...others].map((v) => (v.creativeId ? deps.store.getCreative(deps.organizationId, v.creativeId) : Promise.resolve(null))));
  const loser = oc[0] ?? null;
  const metric = METRIC_LABEL[e.primaryMetric] ?? e.primaryMetric.toUpperCase();
  const lift = result.liftPct === null ? null : Math.round(Math.abs(result.liftPct) * 100);
  const principle = wc ? principleOf({ learning: `${wc.hook} ${wc.angle}`, attributes: {} }) : null;
  const goalLabel = e.goal === "recruitment" ? "採用" : "集客";
  const persona = wc?.persona ?? "";
  const learning = `${goalLabel}${persona ? `（${persona}）` : ""}: 「${wc?.hook ?? winner.label}」が「${loser?.hook ?? "比較案"}」より${metric}で${lift ?? "?"}%良い結果（${e.variable}テスト）。`;
  const location = deps.brain.locations.find((l) => l.id && l.id === e.locationId)?.name ?? "";
  await deps.social.addLearning(
    deps.organizationId,
    {
      locationId: e.locationId,
      socialAccountId: null,
      platform: null,
      goal: e.goal,
      contentPillar: `ad:${e.variable}`,
      hypothesis: e.hypothesis,
      result: result.reasons.join(" "),
      learning,
      confidence: Math.min(0.95, Math.max(0.5, result.liftPct === null ? 0.6 : 0.6 + Math.min(0.3, Math.abs(result.liftPct)))),
      validFrom: new Date().toISOString().slice(0, 10),
      validUntil: addDateDays(new Date().toISOString().slice(0, 10), 180),
      sourcePostIds: [],
      sourceReviewId: null,
      kind: "creative",
      sourceExperimentId: e.id,
      attributes: {
        goal: e.goal,
        variable: e.variable,
        persona,
        painPoint: wc?.painPoint ?? "",
        hook: wc?.hook ?? "",
        angle: wc?.angle ?? "",
        visual: wc?.visualDirection ?? "",
        cta: wc?.cta ?? "",
        offer: wc?.offer ?? "",
        format: wc?.format ?? "",
        platform: "meta",
        location,
        industry: deps.brain.industry.label,
        winningPattern: wc?.hook ?? "",
        losingPattern: loser?.hook ?? "",
        principle: principle?.principle ?? "",
        why: result.reasons[0] ?? "",
      },
    },
    deps.actorUserId,
  );
  await logAdsEvent(deps.organizationId, { type: "learning_saved", message: `Creative Memoryに保存しました：${learning.slice(0, 80)}`, locationId: e.locationId, details: { experimentId: e.id }, actorUserId: deps.actorUserId });
}
