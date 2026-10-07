import "server-only";
import type { AppContext } from "@/lib/auth/context";
import type { ID } from "@/lib/domain/types";
import { seedDemoAds } from "@/lib/demo/ads-seed";
import { getSocialContext } from "@/lib/social/access";
import type { SocialStore } from "@/lib/social/store";
import { assertCanEditAds, assertCanOperateAds, canAccessAdsLocation, filterAdsByLocation, getAdsContext, type AdsAccess } from "./access";
import { findingsFor, loadAdsWorkspace, runAdAnalysis, type AdsWorkspace } from "./analysis";
import { parseConversionCsv } from "./conversions";
import { generateCreativeDrafts, loadHypothesisContext, reviewCreative, type CreativeReview } from "./creatives";
import { logAdsEvent } from "./events";
import {
  activateExperiment,
  approveExperiment,
  cancelExperiment,
  completeExperiment,
  createExperimentDraft,
  launchExperiment,
  refreshExperiment,
  type ExperimentDeps,
} from "./experiment-service";
import { AdsStoreError, type AdsStore } from "./store";
import type { AdCampaign, ConversionKind, Experiment } from "./types";

/**
 * Bridge between the signed-in user (AppContext) and the ad loop services.
 * Every mutation checks permissions here first:
 *   read                → any member (location scope applies)
 *   analyze / generate / review creatives / approve test plan → editor+
 *   anything that changes Meta (launch, start, pause, connect)  → owner / admin / location manager
 */
async function socialStores(app: AppContext): Promise<{ reader: SocialStore; writer: SocialStore | null }> {
  const s = await getSocialContext(app);
  return { reader: s.reader, writer: s.writer };
}

/** Existing demo organizations get the ad demo lazily (new ones are seeded at creation). */
export async function ensureDemoAds(app: AppContext, ctx: AdsAccess): Promise<void> {
  if (!ctx.isDemo || !ctx.writer || ctx.role === "viewer") return;
  if ((await ctx.reader.listAdAccounts(ctx.organizationId)).length) return;
  try {
    const social = await socialStores(app);
    await seedDemoAds(ctx.writer, social.writer, app.repo, ctx.organizationId, null);
  } catch (error) {
    console.error("[ads] demo seed failed", error instanceof Error ? error.message : error);
  }
}

export interface AdsPageData {
  ctx: AdsAccess;
  ws: AdsWorkspace;
  findings: ReturnType<typeof findingsFor>;
  experiments: Experiment[];
}

/** Workspace filtered to what the user may see (location scope). */
export async function loadAdsPageData(app: AppContext): Promise<AdsPageData> {
  const ctx = await getAdsContext(app);
  await ensureDemoAds(app, ctx);
  const raw = await loadAdsWorkspace(ctx.reader, ctx.organizationId);
  const campaigns = filterAdsByLocation(ctx, raw.campaigns);
  const campaignIds = new Set(campaigns.map((c) => c.id));
  const ads = raw.ads.filter((a) => (a.campaignId ? campaignIds.has(a.campaignId) : canAccessAdsLocation(ctx, a.locationId)));
  const adIds = new Set(ads.map((a) => a.id));
  const adSets = raw.adSets.filter((s) => campaignIds.has(s.campaignId));
  const adSetIds = new Set(adSets.map((s) => s.id));
  const ws: AdsWorkspace = {
    campaigns,
    adSets,
    ads,
    creatives: raw.creatives.filter((c) => canAccessAdsLocation(ctx, c.locationId) || ads.some((a) => a.creativeId === c.id)),
    snapshots: raw.snapshots.filter(
      (s) =>
        (s.entityType === "campaign" && campaignIds.has(s.entityId)) ||
        (s.entityType === "ad" && adIds.has(s.entityId)) ||
        (s.entityType === "ad_set" && adSetIds.has(s.entityId)) ||
        (s.entityType === "account" && ctx.locationIds === null),
    ),
    end: raw.end,
  };
  const experiments = filterAdsByLocation(ctx, await ctx.reader.listExperiments(ctx.organizationId));
  return { ctx, ws, findings: findingsFor(ws), experiments };
}

export async function loadCreativeLearnings(app: AppContext) {
  const social = await socialStores(app);
  return (await social.reader.listLearnings(app.current.organization.id, { status: "active" })).filter((l) => l.kind === "creative");
}

async function experimentDeps(app: AppContext, ctx: AdsAccess, store: AdsStore): Promise<ExperimentDeps> {
  const social = await socialStores(app);
  return { store, social: social.writer, brain: app.brain, organizationId: ctx.organizationId, actorUserId: ctx.userId, isDemo: ctx.isDemo };
}

async function experimentFor(ctx: AdsAccess, id: ID): Promise<Experiment> {
  const e = await ctx.reader.getExperiment(ctx.organizationId, id);
  if (!e || !canAccessAdsLocation(ctx, e.locationId)) throw new AdsStoreError("テストが見つかりません", "not_found");
  return e;
}

// ---------------------------------------------------------------- analysis
export async function analyzeAds(app: AppContext, options: { locationId?: ID | null } = {}) {
  const ctx = await getAdsContext(app);
  const store = assertCanEditAds(ctx, options.locationId ?? null);
  return runAdAnalysis({ store, repo: app.repo, brain: app.brain, organizationId: ctx.organizationId, actorUserId: ctx.userId, locationIds: ctx.locationIds }, options);
}

// ---------------------------------------------------------------- creatives
export async function getHypothesisContext(app: AppContext, hypothesisId: ID) {
  const ctx = await getAdsContext(app);
  const h = await loadHypothesisContext(ctx.reader, app.brain, ctx.organizationId, hypothesisId);
  if (!h || !canAccessAdsLocation(ctx, h.hypothesis.locationId)) return null;
  return h;
}

export async function generateDrafts(app: AppContext, hypothesisId: ID, regenerate: boolean) {
  const ctx = await getAdsContext(app);
  const h = await getHypothesisContext(app, hypothesisId);
  if (!h) throw new AdsStoreError("仮説が見つかりません", "not_found");
  const store = assertCanEditAds(ctx, h.hypothesis.locationId);
  const social = await socialStores(app);
  return generateCreativeDrafts({ store, social: social.reader, brain: app.brain, organizationId: ctx.organizationId, actorUserId: ctx.userId }, hypothesisId, { regenerate });
}

export async function reviewDraft(app: AppContext, creativeId: ID, review: CreativeReview) {
  const ctx = await getAdsContext(app);
  const c = await ctx.reader.getCreative(ctx.organizationId, creativeId);
  if (!c) throw new AdsStoreError("Creativeが見つかりません", "not_found");
  const store = assertCanEditAds(ctx, c.locationId);
  return reviewCreative({ store, social: null, brain: app.brain, organizationId: ctx.organizationId, actorUserId: ctx.userId }, creativeId, review);
}

export async function rejectHypothesis(app: AppContext, hypothesisId: ID) {
  const ctx = await getAdsContext(app);
  const h = await getHypothesisContext(app, hypothesisId);
  if (!h) throw new AdsStoreError("仮説が見つかりません", "not_found");
  const store = assertCanEditAds(ctx, h.hypothesis.locationId);
  await store.updateHypothesis(ctx.organizationId, hypothesisId, { status: "rejected", decidedBy: ctx.userId, decidedAt: new Date().toISOString() });
  await logAdsEvent(ctx.organizationId, { type: "hypothesis_rejected", message: `仮説を見送りました：${h.hypothesis.hypothesis.slice(0, 60)}`, locationId: h.hypothesis.locationId, details: { hypothesisId }, actorUserId: ctx.userId });
}

// ---------------------------------------------------------------- experiments
export async function createExperiment(app: AppContext, hypothesisId: ID, creativeIds: ID[]) {
  const ctx = await getAdsContext(app);
  const h = await getHypothesisContext(app, hypothesisId);
  if (!h) throw new AdsStoreError("仮説が見つかりません", "not_found");
  const store = assertCanEditAds(ctx, h.hypothesis.locationId);
  return createExperimentDraft(await experimentDeps(app, ctx, store), { hypothesisId, challengerCreativeIds: creativeIds });
}

export type ExperimentCommand = "approve" | "launch_start" | "launch_paused" | "activate" | "refresh" | "complete" | "complete_pause_losers" | "cancel";

export async function runExperimentCommand(app: AppContext, experimentId: ID, command: ExperimentCommand): Promise<Experiment | null> {
  const ctx = await getAdsContext(app);
  const e = await experimentFor(ctx, experimentId);
  // Meta-changing commands need the operator role; the rest editor+.
  const operates = command === "launch_start" || command === "launch_paused" || command === "activate" || command === "complete_pause_losers" || (command === "cancel" && Boolean(e.launchedAt));
  const store = operates ? assertCanOperateAds(ctx, e.locationId) : assertCanEditAds(ctx, e.locationId);
  const deps = await experimentDeps(app, ctx, store);
  switch (command) {
    case "approve":
      return approveExperiment(deps, experimentId);
    case "launch_start":
      return launchExperiment(deps, experimentId, { start: true });
    case "launch_paused":
      return launchExperiment(deps, experimentId, { start: false });
    case "activate":
      return activateExperiment(deps, experimentId);
    case "refresh":
      return refreshExperiment(store, ctx.organizationId, experimentId);
    case "complete":
      return completeExperiment(deps, experimentId, { pauseLosers: false });
    case "complete_pause_losers":
      return completeExperiment(deps, experimentId, { pauseLosers: true });
    case "cancel":
      return cancelExperiment(deps, experimentId);
  }
}

// ---------------------------------------------------------------- settings & conversions
export async function updateCampaignSettings(app: AppContext, campaignId: ID, patch: Partial<Pick<AdCampaign, "goal" | "landingPageUrl" | "locationId" | "conversionEvent">>) {
  const ctx = await getAdsContext(app);
  const campaign = (await ctx.reader.listCampaigns(ctx.organizationId)).find((c) => c.id === campaignId);
  if (!campaign || !canAccessAdsLocation(ctx, campaign.locationId)) throw new AdsStoreError("キャンペーンが見つかりません", "not_found");
  if (patch.locationId && !app.brain.locations.some((l) => l.id === patch.locationId)) throw new AdsStoreError("店舗が見つかりません", "not_found");
  const store = assertCanEditAds(ctx, patch.locationId === undefined ? campaign.locationId : patch.locationId);
  assertCanEditAds(ctx, campaign.locationId);
  await store.updateCampaign(ctx.organizationId, campaignId, patch);
}

export async function recordConversions(
  app: AppContext,
  input: { mode: "manual"; rows: { occurredOn: string; kind: ConversionKind; count: number; revenue: number | null; campaignId: ID | null; note: string }[] } | { mode: "csv"; csv: string },
): Promise<{ saved: number; errors: string[] }> {
  const ctx = await getAdsContext(app);
  const campaigns = filterAdsByLocation(ctx, await ctx.reader.listCampaigns(ctx.organizationId));
  let rows: { occurredOn: string; kind: ConversionKind; count: number; revenue: number | null; campaignId: ID | null; note: string }[];
  let errors: string[] = [];
  if (input.mode === "csv") {
    const parsed = parseConversionCsv(input.csv);
    errors = parsed.errors;
    rows = parsed.rows.map((r) => {
      const c = r.campaign ? campaigns.find((x) => x.name === r.campaign || x.externalId === r.campaign) : undefined;
      if (r.campaign && !c) errors.push(`キャンペーン「${r.campaign}」が見つからないため、キャンペーン未指定で保存しました`);
      return { occurredOn: r.occurredOn, kind: r.kind, count: r.count, revenue: r.revenue, campaignId: c?.id ?? null, note: r.note };
    });
  } else rows = input.rows;
  let saved = 0;
  // Each row is authorized for its own location.
  for (const r of rows) {
    const campaign = r.campaignId ? campaigns.find((c) => c.id === r.campaignId) : undefined;
    if (r.campaignId && !campaign) throw new AdsStoreError("キャンペーンが見つかりません", "not_found");
    if (!campaign && ctx.locationIds !== null) throw new AdsStoreError("店舗担当の方はキャンペーンを指定して記録してください", "forbidden");
    const store = assertCanEditAds(ctx, campaign?.locationId ?? null);
    saved += await store.addConversions(ctx.organizationId, [
      { locationId: campaign?.locationId ?? null, campaignId: r.campaignId, adId: null, kind: r.kind, occurredOn: r.occurredOn, count: r.count, revenue: r.revenue, source: input.mode, note: r.note, createdBy: ctx.userId },
    ]);
  }
  if (saved) await logAdsEvent(ctx.organizationId, { type: "conversions_recorded", message: `自社計測のコンバージョンを${saved}件記録しました（${input.mode === "csv" ? "CSV" : "手入力"}）`, details: { count: saved }, actorUserId: ctx.userId });
  return { saved, errors };
}
