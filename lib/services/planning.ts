import "server-only";
import type { DataRepository } from "@/lib/data/repository";
import { RepositoryError } from "@/lib/data/repository";
import type { BrandBrain, PlanItem, PlanProposal, PlanProposalStatus } from "@/lib/domain/types";
import type { ContentLearning } from "@/lib/social/types";
import { jstDateKey } from "@/lib/domain/dates";
import { getAIProvider } from "@/lib/ai";
import {
  buildMonthlyPlanRequest,
  buildPlanItemRegenerationRequest,
  toPlanItem,
  toPlanItems,
  type MonthlyPlanContext,
} from "@/lib/ai/prompts/monthly-plan";
import { computePostingSlots, jstSlotToIso, type PostingSlot } from "@/lib/planning/slots";
import { findLocation } from "./localization";

/**
 * AI monthly planning with human-in-the-loop:
 *   generate → proposal (stored, NOT in the planner) → human approves / rejects /
 *   edits / regenerates → only approved items become planner posts.
 */

async function planContext(
  repo: DataRepository,
  organizationId: string,
  brain: BrandBrain,
  opts: { accountId: string; month: string; hqCampaignId: string | null; notes: string; memory?: ContentLearning[] },
): Promise<MonthlyPlanContext> {
  const [accounts, locations, campaigns, pillars] = await Promise.all([
    repo.listAccounts(organizationId),
    repo.listLocationProfiles(organizationId),
    repo.listHqCampaigns(organizationId),
    repo.listContentPillars(organizationId),
  ]);
  const account = accounts.find((a) => a.id === opts.accountId);
  if (!account) throw new RepositoryError("account not found", "not_found");
  const campaign = opts.hqCampaignId ? (campaigns.find((c) => c.id === opts.hqCampaignId) ?? null) : null;
  if (opts.hqCampaignId && !campaign) throw new RepositoryError("campaign not found", "not_found");

  const [year, month] = opts.month.split("-").map(Number) as [number, number];
  const today = jstDateKey(new Date());
  const currentMonth = today.slice(0, 7);
  if (opts.month < currentMonth) throw new RepositoryError("過去の月の計画は作成できません", "invalid");
  const tomorrow = jstDateKey(new Date(Date.now() + 86_400_000));
  const slots = computePostingSlots({
    year,
    month,
    postsPerWeek: account.strategy.postsPerWeek,
    preferredDays: account.strategy.preferredPostingDays,
    preferredTimes: account.strategy.preferredPostingTimes,
    platform: account.platform,
    goal: account.goal,
    earliestDate: opts.month === currentMonth ? tomorrow : undefined,
  });
  return {
    brain,
    account,
    location: findLocation(locations, account.locationId),
    campaign,
    pillars,
    slots,
    month: opts.month,
    notes: opts.notes,
    memory: opts.memory ?? [],
  };
}

export async function generateMonthlyPlan(
  repo: DataRepository,
  organizationId: string,
  brain: BrandBrain,
  opts: { accountId: string; month: string; hqCampaignId: string | null; notes: string; memory?: ContentLearning[] },
): Promise<PlanProposal> {
  const ctx = await planContext(repo, organizationId, brain, opts);
  if (!ctx.slots.length) throw new RepositoryError("投稿頻度が0本、または対象月に投稿できる日がありません", "invalid");
  const provider = getAIProvider();
  const { object } = await provider.generateStructuredObject(buildMonthlyPlanRequest(ctx));
  return repo.createPlanProposal(organizationId, {
    accountId: ctx.account.id,
    locationId: ctx.account.locationId,
    hqCampaignId: ctx.campaign?.id ?? null,
    month: ctx.month,
    goal: ctx.account.goal,
    summary: object.summary,
    aiProvider: provider.name,
    items: toPlanItems(ctx, object.items),
  });
}

function nextStatus(items: PlanItem[]): PlanProposalStatus {
  const approved = items.filter((i) => i.status === "approved").length;
  const rejected = items.filter((i) => i.status === "rejected").length;
  if (approved === items.length) return "approved";
  if (rejected === items.length) return "rejected";
  return approved > 0 ? "partially_approved" : "pending";
}

async function loadProposal(repo: DataRepository, organizationId: string, proposalId: string): Promise<PlanProposal> {
  const proposal = await repo.getPlanProposal(organizationId, proposalId);
  if (!proposal) throw new RepositoryError("proposal not found", "not_found");
  return proposal;
}

/** Approve selected (or all pending) items → each becomes a planner post. Idempotent. */
export async function approvePlanItems(
  repo: DataRepository,
  organizationId: string,
  proposalId: string,
  itemIds: string[] | null,
): Promise<{ approved: number; proposal: PlanProposal }> {
  const proposal = await loadProposal(repo, organizationId, proposalId);
  const targets = proposal.items.filter((i) => i.status === "pending" && (!itemIds || itemIds.includes(i.id)));
  for (const item of targets) {
    const post = await repo.createPost(organizationId, {
      platform: item.platform,
      contentType: item.contentType,
      title: item.theme,
      caption: "",
      cta: item.cta,
      hashtags: [],
      // Planned (caption not written yet). Becomes "scheduled" after the caption step.
      status: "draft",
      scheduledAt: jstSlotToIso(item.scheduledDate, item.scheduledTime),
      source: "ai_planner",
      accountId: proposal.accountId,
      locationId: proposal.locationId,
      hqCampaignId: proposal.hqCampaignId,
      planning: {
        theme: item.theme,
        hook: item.hook,
        summary: item.summary,
        goal: item.goal,
        target: item.target,
        contentPillar: item.contentPillar,
        funnelStage: item.funnelStage,
        planItemId: item.id,
      },
    });
    await repo.updatePlanItem(organizationId, item.id, { status: "approved", postId: post.id });
  }
  const updated = await loadProposal(repo, organizationId, proposalId);
  await repo.setPlanProposalStatus(organizationId, proposalId, nextStatus(updated.items));
  return { approved: targets.length, proposal: { ...updated, status: nextStatus(updated.items) } };
}

export async function rejectPlanItems(repo: DataRepository, organizationId: string, proposalId: string, itemIds: string[]): Promise<PlanProposal> {
  const proposal = await loadProposal(repo, organizationId, proposalId);
  for (const item of proposal.items.filter((i) => i.status === "pending" && itemIds.includes(i.id))) {
    await repo.updatePlanItem(organizationId, item.id, { status: "rejected" });
  }
  const updated = await loadProposal(repo, organizationId, proposalId);
  await repo.setPlanProposalStatus(organizationId, proposalId, nextStatus(updated.items));
  return { ...updated, status: nextStatus(updated.items) };
}

function assertEditable(item: PlanItem | undefined): PlanItem {
  if (!item) throw new RepositoryError("plan item not found", "not_found");
  if (item.status === "approved") throw new RepositoryError("承認済みの案は投稿カレンダーで編集してください", "invalid");
  return item;
}

export async function regeneratePlanItem(
  repo: DataRepository,
  organizationId: string,
  brain: BrandBrain,
  proposalId: string,
  itemId: string,
  instruction: string,
  attempt: number,
): Promise<PlanItem> {
  const proposal = await loadProposal(repo, organizationId, proposalId);
  const index = proposal.items.findIndex((i) => i.id === itemId);
  const item = assertEditable(proposal.items[index]);
  const ctx = await planContext(repo, organizationId, brain, {
    accountId: proposal.accountId,
    month: proposal.month,
    hqCampaignId: proposal.hqCampaignId,
    notes: "",
  }).catch(async (error: unknown) => {
    // Regenerating an item of a past/current month must still work.
    if (error instanceof RepositoryError && error.code === "invalid") {
      return planContext(repo, organizationId, brain, { accountId: proposal.accountId, month: jstDateKey(new Date()).slice(0, 7), hqCampaignId: proposal.hqCampaignId, notes: "" });
    }
    throw error;
  });
  const weekday = new Date(`${item.scheduledDate}T00:00:00Z`).getUTCDay();
  const slot: PostingSlot = { index, date: item.scheduledDate, time: item.scheduledTime, weekday, funnelStage: item.funnelStage };
  const { object } = await getAIProvider().generateStructuredObject(
    buildPlanItemRegenerationRequest(ctx, slot, { theme: item.theme, contentType: item.contentType }, instruction, attempt),
  );
  const next = toPlanItem(ctx, slot, { ...object.item, slot: index });
  return repo.updatePlanItem(organizationId, itemId, { ...next, status: "pending" });
}

export async function editPlanItem(
  repo: DataRepository,
  organizationId: string,
  proposalId: string,
  itemId: string,
  patch: Parameters<DataRepository["updatePlanItem"]>[2],
): Promise<PlanItem> {
  const proposal = await loadProposal(repo, organizationId, proposalId);
  assertEditable(proposal.items.find((i) => i.id === itemId));
  return repo.updatePlanItem(organizationId, itemId, { ...patch, status: undefined, postId: undefined });
}
