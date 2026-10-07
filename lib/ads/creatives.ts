import "server-only";
import { buildCreativeSetRequest, toGeneratedSet } from "@/lib/ai/prompts/ads-loop";
import type { BrandBrainInput, ID } from "@/lib/domain/types";
import type { SocialStore } from "@/lib/social/store";
import { generateOrFallback } from "./analysis";
import { chooseAngles, formatCreativeMemory, principleOf, rankCreativeLearnings } from "./creative-memory";
import type { CreativeGenInput } from "./creative-gen";
import { logAdsEvent } from "./events";
import { AdsStoreError, type AdsStore, type CreativePatch } from "./store";
import type { AdCreativeRecord, CreativeAngle, CreativeHypothesis } from "./types";

export interface CreativeDeps {
  store: AdsStore;
  social: SocialStore | null;
  brain: BrandBrainInput;
  organizationId: ID;
  actorUserId: ID | null;
}

/** Everything Studio needs to open "from a hypothesis" without re-typing anything. */
export interface HypothesisContext {
  hypothesis: CreativeHypothesis;
  campaignName: string;
  adSetName: string;
  audienceLabel: string;
  locationName: string;
  landingPageUrl: string | null;
  control: AdCreativeRecord | null;
  controlAdName: string;
  controlAdExternalId: string | null;
  adSetExternalId: string | null;
  persona: string;
  painPoint: string;
  drafts: AdCreativeRecord[];
}

export async function loadHypothesisContext(store: AdsStore, brain: BrandBrainInput, organizationId: ID, hypothesisId: ID): Promise<HypothesisContext | null> {
  const hypothesis = (await store.listHypotheses(organizationId)).find((h) => h.id === hypothesisId);
  if (!hypothesis) return null;
  const [campaigns, adSets, ads, creatives] = await Promise.all([store.listCampaigns(organizationId), store.listAdSets(organizationId), store.listAds(organizationId), store.listCreatives(organizationId)]);
  const ad = ads.find((a) => a.id === hypothesis.adId);
  const campaign = campaigns.find((c) => c.id === (hypothesis.campaignId ?? ad?.campaignId));
  const adSet = adSets.find((s) => s.id === (hypothesis.adSetId ?? ad?.adSetId));
  const control = creatives.find((c) => c.id === ad?.creativeId) ?? null;
  const locationName = brain.locations.find((l) => l.id && l.id === (campaign?.locationId ?? ad?.locationId))?.name ?? (campaign?.goal === "recruitment" ? `${brain.brandName || brain.companyName} 本部` : brain.brandName || brain.companyName);
  return {
    hypothesis,
    campaignName: campaign?.name ?? "",
    adSetName: adSet?.name ?? "",
    audienceLabel: adSet?.audienceLabel ?? "",
    locationName,
    landingPageUrl: ad?.landingPageUrl ?? campaign?.landingPageUrl ?? null,
    control,
    controlAdName: ad?.name ?? "",
    controlAdExternalId: ad?.externalId ?? null,
    adSetExternalId: adSet?.externalId ?? null,
    persona: control?.persona || adSet?.audienceLabel || brain.personas[0]?.description || "",
    painPoint: control?.painPoint || brain.targetAudience.painPoints[0] || "",
    drafts: creatives.filter((c) => c.hypothesisId === hypothesisId && c.source === "ai_generated" && c.status !== "archived"),
  };
}

/**
 * Hypothesis → Creative Brief → challengers B / C (status in_review).
 * Nothing is sent to Meta; a human reviews (approve / edit / reject /
 * regenerate) and only approved creatives can enter an experiment.
 */
export async function generateCreativeDrafts(deps: CreativeDeps, hypothesisId: ID, options: { regenerate?: boolean } = {}): Promise<HypothesisContext> {
  const ctx = await loadHypothesisContext(deps.store, deps.brain, deps.organizationId, hypothesisId);
  if (!ctx) throw new AdsStoreError("仮説が見つかりません", "not_found");
  const h = ctx.hypothesis;
  if (h.status === "rejected" || h.status === "validated" || h.status === "invalidated") throw new AdsStoreError("この仮説は既に完了・却下されています", "conflict");
  if (h.changeVariable === "landing_page") throw new AdsStoreError("LPが原因の仮説です。Creativeではなく、LPの確認・改善から行ってください。", "conflict");
  if (ctx.drafts.some((d) => d.status === "published")) throw new AdsStoreError("この仮説のCreativeは既にテストに使われています", "conflict");

  const all = await deps.store.listCreatives(deps.organizationId);
  const campaignAds = (await deps.store.listAds(deps.organizationId)).filter((a) => a.campaignId === h.campaignId);
  const campaignCreatives = all.filter((c) => campaignAds.some((a) => a.creativeId === c.id) || c.hypothesisId === hypothesisId);
  const learnings = deps.social ? await deps.social.listLearnings(deps.organizationId, { status: "active" }).catch(() => []) : [];
  const memory = rankCreativeLearnings(learnings, { goal: h.goal, persona: ctx.persona, painPoint: ctx.painPoint, locationId: h.locationId });
  const principles = memory.map(principleOf).filter((p): p is NonNullable<typeof p> => p !== null);
  const memoryAngle = memory.map((l) => l.attributes?.angle).find((a): a is CreativeAngle => !!a) ?? null;
  const preferred: CreativeAngle | null =
    h.changeVariable === "problem_angle" ? "problem" : h.changeVariable === "expertise_angle" ? "expertise" : (memoryAngle ?? (h.goal === "recruitment" ? "employee_story" : "lifestyle"));
  const angles = chooseAngles(h.goal, { preferred, recentAngles: campaignCreatives.map((c) => c.angle).filter(Boolean) });
  const previous = ctx.drafts.filter((d) => d.status === "in_review" || d.status === "draft" || d.status === "rejected");

  const input: CreativeGenInput = {
    brandName: deps.brain.brandName || deps.brain.companyName,
    locationName: ctx.locationName,
    goal: h.goal,
    persona: ctx.persona,
    painPoint: ctx.painPoint,
    problem: h.problem,
    hypothesis: h.hypothesis,
    variable: h.changeVariable,
    control: {
      headline: ctx.control?.headline ?? "",
      primaryText: ctx.control?.primaryText ?? "",
      hook: ctx.control?.hook || ctx.control?.headline || "",
      angle: ctx.control?.angle ?? "",
      cta: ctx.control?.cta || (h.goal === "recruitment" ? "APPLY_NOW" : "BOOK_NOW"),
      visualDirection: ctx.control?.visualDirection ?? "",
      format: ctx.control?.format ?? null,
    },
    angles,
    principles,
    avoidHooks: [...new Set(campaignCreatives.flatMap((c) => [c.hook, c.headline]).filter(Boolean))],
    strengths: deps.brain.strengths,
    brandTone: [deps.brain.writingTone, ...deps.brain.brandTone].filter(Boolean).join(" / "),
    offer: deps.brain.services.find((s) => /初回|カウンセリング/.test(s.name))?.name ?? "",
    seed: options.regenerate ? previous.length + 1 : 0,
  };
  const { object, provider } = await generateOrFallback(buildCreativeSetRequest(deps.brain, input, formatCreativeMemory(memory)));
  const set = toGeneratedSet(object, angles);

  // Regenerate replaces the open drafts (kept for history as archived).
  for (const d of previous) await deps.store.updateCreative(deps.organizationId, d.id, { status: "archived" });
  for (const v of set.variants) {
    await deps.store.createCreative({
      organizationId: deps.organizationId,
      adAccountId: ctx.control?.adAccountId ?? null,
      locationId: h.locationId,
      externalId: null,
      source: "ai_generated",
      goal: h.goal,
      status: "in_review",
      concept: `${v.label}｜${v.hook}`,
      headline: v.headline,
      primaryText: v.primaryText,
      cta: v.cta,
      format: ctx.control?.format ?? "image",
      hook: v.hook,
      angle: v.angle,
      persona: ctx.persona,
      painPoint: ctx.painPoint,
      offer: input.offer,
      firstViewCopy: v.firstViewCopy,
      visualDirection: v.visualDirection,
      videoScript: v.videoScript,
      brief: set.brief,
      thumbnailUrl: ctx.control?.thumbnailUrl ?? null,
      landingPageUrl: ctx.landingPageUrl,
      hypothesisId: h.id,
      parentCreativeId: ctx.control?.id ?? null,
      variableChanged: h.changeVariable,
      approvedBy: null,
      approvedAt: null,
      rejectedReason: null,
      aiProvider: provider,
    });
  }
  if (h.status === "proposed") {
    await deps.store.updateHypothesis(deps.organizationId, h.id, { status: "accepted", decidedBy: deps.actorUserId, decidedAt: new Date().toISOString() });
    await logAdsEvent(deps.organizationId, { type: "hypothesis_accepted", message: `仮説を採用しCreative案の作成を開始しました：${h.hypothesis.slice(0, 60)}`, locationId: h.locationId, details: { hypothesisId: h.id }, actorUserId: deps.actorUserId });
  }
  await logAdsEvent(deps.organizationId, {
    type: "creative_draft_generated",
    message: `Creative案（B / C）を${options.regenerate ? "再" : ""}生成しました（変更する変数: ${h.changeVariable}）`,
    locationId: h.locationId,
    details: { hypothesisId: h.id, provider, regenerate: Boolean(options.regenerate) },
    actorUserId: deps.actorUserId,
  });
  return (await loadHypothesisContext(deps.store, deps.brain, deps.organizationId, hypothesisId)) as HypothesisContext;
}

export type CreativeReview = { action: "approve" } | { action: "reject"; reason: string } | { action: "edit"; patch: Pick<CreativePatch, "headline" | "primaryText" | "hook" | "firstViewCopy" | "visualDirection" | "cta"> };

/** Human review. Editing sends the creative back to in_review (edited copy must be re-approved). */
export async function reviewCreative(deps: CreativeDeps, creativeId: ID, review: CreativeReview): Promise<AdCreativeRecord> {
  const c = await deps.store.getCreative(deps.organizationId, creativeId);
  if (!c || c.source !== "ai_generated") throw new AdsStoreError("Creativeが見つかりません", "not_found");
  if (c.status === "published" || c.status === "archived") throw new AdsStoreError("公開済み・アーカイブ済みのCreativeは変更できません", "conflict");
  const now = new Date().toISOString();
  if (review.action === "approve") {
    if (c.status !== "in_review" && c.status !== "draft") throw new AdsStoreError("レビュー中のCreativeだけ承認できます", "conflict");
    const updated = await deps.store.updateCreative(deps.organizationId, c.id, { status: "approved", approvedBy: deps.actorUserId, approvedAt: now, rejectedReason: null });
    await logAdsEvent(deps.organizationId, { type: "creative_approved", message: `Creativeを承認しました：${c.hook}`, locationId: c.locationId, details: { creativeId: c.id, hypothesisId: c.hypothesisId }, actorUserId: deps.actorUserId });
    return updated;
  }
  if (review.action === "reject") {
    const updated = await deps.store.updateCreative(deps.organizationId, c.id, { status: "rejected", rejectedReason: review.reason.slice(0, 300), approvedBy: null, approvedAt: null });
    await logAdsEvent(deps.organizationId, { type: "creative_rejected", message: `Creativeを却下しました：${c.hook}`, locationId: c.locationId, details: { creativeId: c.id, reason: review.reason.slice(0, 200) }, actorUserId: deps.actorUserId });
    return updated;
  }
  const patch = Object.fromEntries(Object.entries(review.patch).filter(([, v]) => typeof v === "string")) as CreativePatch;
  const updated = await deps.store.updateCreative(deps.organizationId, c.id, { ...patch, status: "in_review", approvedBy: null, approvedAt: null });
  await logAdsEvent(deps.organizationId, { type: "creative_edited", message: `Creativeを編集しました（再承認待ち）：${updated.hook}`, locationId: c.locationId, details: { creativeId: c.id }, actorUserId: deps.actorUserId });
  return updated;
}
