import "server-only";
import type { AppContext } from "@/lib/auth/context";
import type { Post, Recommendation, SnsAccount } from "@/lib/domain/types";
import { jstDateKey } from "@/lib/domain/dates";
import { jstSlotToIso } from "@/lib/planning/slots";
import { getSocialContext } from "@/lib/social/access";

/**
 * Recommendation → (human) Approve → Planner.
 * Approving an account-specific recommendation adds a DRAFT planner item on
 * the account's next preferred posting slot. It is never published without
 * the normal approve → queue flow, so AI cannot change the operation by itself.
 */
export function nextPostingSlot(account: Pick<SnsAccount, "strategy">, now: Date = new Date()): string {
  const days = account.strategy.preferredPostingDays.length ? account.strategy.preferredPostingDays : [0, 1, 2, 3, 4, 5, 6];
  const time = account.strategy.preferredPostingTimes[0] ?? "20:00";
  for (let offset = 2; offset <= 9; offset++) {
    const date = jstDateKey(new Date(now.getTime() + offset * 86_400_000));
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (days.includes(weekday)) return jstSlotToIso(date, time);
  }
  return jstSlotToIso(jstDateKey(new Date(now.getTime() + 2 * 86_400_000)), time);
}

export async function applyRecommendationDecision(app: AppContext, rec: Recommendation, status: Recommendation["status"]): Promise<Post | null> {
  const ctx = await getSocialContext(app);
  const orgId = ctx.organizationId;
  let created: Post | null = null;
  if (status === "approved" && rec.socialAccountId) {
    const account = (await app.repo.listAccounts(orgId)).find((a) => a.id === rec.socialAccountId);
    if (account) {
      created = await app.repo.createPost(orgId, {
        platform: account.platform,
        contentType: account.platform === "threads" ? "threads_text" : "reel",
        title: `【AI提案】${rec.title}`.slice(0, 200),
        caption: "",
        cta: "",
        hashtags: [],
        status: "draft",
        scheduledAt: nextPostingSlot(account),
        source: "manual",
        accountId: account.id,
        locationId: account.locationId,
        planning: { summary: rec.recommendedAction, hook: "", theme: rec.hypothesis.slice(0, 200), target: account.strategy.targetAudience },
      });
    }
  }
  await ctx.writer?.logEvent(orgId, {
    type: status === "approved" ? "recommendation_approved" : status === "rejected" ? "recommendation_rejected" : "recommendation_generated",
    message: `AI Recommendation「${rec.title}」を${status === "approved" ? "承認" : status === "rejected" ? "却下" : "更新"}しました${created ? "（SNS Plannerに下書きを追加）" : ""}`,
    socialAccountId: rec.socialAccountId,
    locationId: rec.locationId,
    postId: created?.id ?? null,
    actorUserId: ctx.userId,
  });
  return created;
}

