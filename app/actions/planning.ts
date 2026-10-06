"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppContext } from "@/lib/auth/context";
import { generateMonthlyPlanSchema, planItemInputSchema } from "@/lib/domain/schemas";
import type { PlanItem, PlanProposal, Recommendation } from "@/lib/domain/types";
import { RECOMMENDATION_STATUSES } from "@/lib/domain/types";
import { validationError, type ActionResult } from "@/lib/actions";
import { RepositoryError } from "@/lib/data/repository";
import { toUserMessage } from "@/lib/services/errors";
import { loadMarketingMemory } from "@/lib/social/memory";
import { applyRecommendationDecision } from "@/lib/services/recommendations";
import { approvePlanItems, editPlanItem, generateMonthlyPlan, regeneratePlanItem, rejectPlanItems } from "@/lib/services/planning";
import { computeOperationsOverview } from "@/lib/services/operations";
import { getAIProvider } from "@/lib/ai";
import { buildOperationsReviewRequest, toRecommendationInputs } from "@/lib/ai/prompts/operations-review";

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

async function editable() {
  const ctx = await requireAppContext();
  if (ctx.current.role === "viewer") throw new RepositoryError("read-only member", "forbidden");
  return ctx;
}

function refreshPlanner() {
  revalidatePath("/planner");
  revalidatePath("/posts");
  revalidatePath("/dashboard");
}

/** Generates an AI proposal. Nothing is added to the planner yet. */
export async function generateMonthlyPlanAction(input: unknown): Promise<ActionResult<{ proposalId: string; items: number }>> {
  const parsed = generateMonthlyPlanSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const app = await editable();
    const { repo, current, brain } = app;
    const account = (await repo.listAccounts(current.organization.id)).find((a) => a.id === parsed.data.accountId);
    // Plan ← Learn: the Marketing Memory of this account / location feeds the next plan.
    const memory = await loadMarketingMemory(app, { accountId: account?.id, locationId: account?.locationId, platform: account?.platform });
    const proposal = await generateMonthlyPlan(repo, current.organization.id, brain, { ...parsed.data, memory });
    revalidatePath("/planner");
    return { ok: true, data: { proposalId: proposal.id, items: proposal.items.length } };
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "invalid") return { ok: false, error: error.message };
    return { ok: false, error: toUserMessage(error, "月間計画の作成に失敗しました") };
  }
}

const approveSchema = z.object({ proposalId: idSchema, itemIds: z.array(idSchema).max(100).nullable() });

export async function approvePlanItemsAction(input: unknown): Promise<ActionResult<{ approved: number; proposal: PlanProposal }>> {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { repo, current } = await editable();
    const result = await approvePlanItems(repo, current.organization.id, parsed.data.proposalId, parsed.data.itemIds);
    refreshPlanner();
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "承認に失敗しました") };
  }
}

export async function rejectPlanItemsAction(input: unknown): Promise<ActionResult<PlanProposal>> {
  const parsed = z.object({ proposalId: idSchema, itemIds: z.array(idSchema).min(1).max(100) }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { repo, current } = await editable();
    const proposal = await rejectPlanItems(repo, current.organization.id, parsed.data.proposalId, parsed.data.itemIds);
    revalidatePath("/planner");
    return { ok: true, data: proposal };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "却下に失敗しました") };
  }
}

export async function editPlanItemAction(input: unknown): Promise<ActionResult<PlanItem>> {
  const parsed = z.object({ proposalId: idSchema, itemId: idSchema, item: planItemInputSchema.partial() }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { repo, current } = await editable();
    const item = await editPlanItem(repo, current.organization.id, parsed.data.proposalId, parsed.data.itemId, parsed.data.item);
    return { ok: true, data: item };
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "invalid") return { ok: false, error: error.message };
    return { ok: false, error: toUserMessage(error, "企画の保存に失敗しました") };
  }
}

export async function regeneratePlanItemAction(input: unknown): Promise<ActionResult<PlanItem>> {
  const parsed = z
    .object({ proposalId: idSchema, itemId: idSchema, instruction: z.string().trim().max(300), attempt: z.number().int().min(1).max(50) })
    .safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { repo, current, brain } = await editable();
    const item = await regeneratePlanItem(repo, current.organization.id, brain, parsed.data.proposalId, parsed.data.itemId, parsed.data.instruction, parsed.data.attempt);
    return { ok: true, data: item };
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "invalid") return { ok: false, error: error.message };
    return { ok: false, error: toUserMessage(error, "再生成に失敗しました") };
  }
}

// ---------------------------------------------------------------------------
// AI recommendations (human approves)
// ---------------------------------------------------------------------------

export async function generateRecommendationsAction(): Promise<ActionResult<Recommendation[]>> {
  try {
    const { repo, current, brain } = await editable();
    const orgId = current.organization.id;
    const [accounts, locations, posts, campaigns, existing] = await Promise.all([
      repo.listAccounts(orgId),
      repo.listLocationProfiles(orgId),
      repo.listPosts(orgId),
      repo.listHqCampaigns(orgId),
      repo.listRecommendations(orgId),
    ]);
    const overview = computeOperationsOverview({ accounts, locations, posts, campaigns });
    const { object } = await getAIProvider().generateStructuredObject(buildOperationsReviewRequest(brain, overview));
    // Skip duplicates of still-pending recommendations.
    const pendingTitles = new Set(existing.filter((r) => r.status === "pending").map((r) => r.title));
    const inputs = toRecommendationInputs(object, accounts).filter((r) => !pendingTitles.has(r.title));
    const created = await repo.createRecommendations(orgId, inputs);
    revalidatePath("/", "layout");
    return { ok: true, data: created };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "AI提案の作成に失敗しました") };
  }
}

export async function setRecommendationStatusAction(input: unknown): Promise<ActionResult<Recommendation>> {
  const parsed = z.object({ id: idSchema, status: z.enum(RECOMMENDATION_STATUSES) }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const app = await editable();
    const { repo, current } = app;
    const before = (await repo.listRecommendations(current.organization.id)).find((r) => r.id === parsed.data.id);
    const rec = await repo.setRecommendationStatus(current.organization.id, parsed.data.id, parsed.data.status);
    // Approve → Planner: only on the transition into "approved" (no duplicates).
    if (before?.status !== rec.status && (rec.status === "approved" || rec.status === "rejected")) {
      await applyRecommendationDecision(app, rec, rec.status).catch((error) => console.error("[recommendation] apply failed", error));
    }
    revalidatePath("/", "layout");
    return { ok: true, data: rec };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "更新に失敗しました") };
  }
}
