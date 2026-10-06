import { describe, expect, it } from "vitest";
import { DemoRepository } from "@/lib/data/demo-repository";
import { createDemoOrganization } from "@/lib/services/organizations";
import { approvePlanItems, editPlanItem, generateMonthlyPlan, regeneratePlanItem, rejectPlanItems } from "@/lib/services/planning";
import { computeOperationsOverview } from "@/lib/services/operations";
import { buildMonthlyPlanRequest } from "@/lib/ai/prompts/monthly-plan";
import { buildOperationsReviewRequest, toRecommendationInputs } from "@/lib/ai/prompts/operations-review";
import { MockAIProvider } from "@/lib/ai/mock";
import { jstDateKey, parseMonth, shiftMonth } from "@/lib/domain/dates";
import { DEMO_BRAND_BRAIN } from "@/lib/demo/seed";
import { SYSTEM_CONTENT_PILLARS } from "@/lib/brand/content-pillars";

const nextMonth = shiftMonth(parseMonth(jstDateKey(new Date()).slice(0, 7)), 1);

async function setup(userId: string) {
  const repo = new DemoRepository(userId);
  const org = await createDemoOrganization(repo);
  const brain = await repo.getBrandBrain(org.id);
  if (!brain) throw new Error("no brain");
  const accounts = await repo.listAccounts(org.id);
  const byHandle = (h: string) => {
    const a = accounts.find((x) => x.handle === h);
    if (!a) throw new Error(h);
    return a;
  };
  return { repo, org, brain, accounts, byHandle };
}

describe("AI monthly plan (human-in-the-loop)", () => {
  it("creates a proposal sized by posting frequency without touching the planner", async () => {
    const { repo, org, brain, byHandle } = await setup("plan-1");
    const ig = byHandle("@naoru_shibuya");
    const postsBefore = (await repo.listPosts(org.id)).length;
    const proposal = await generateMonthlyPlan(repo, org.id, brain, { accountId: ig.id, month: nextMonth, hqCampaignId: null, notes: "" });
    // 4 posts / week → ~16-18 items, on preferred days (Sun/Mon/Wed/Fri) at 20:00
    expect(proposal.items.length).toBeGreaterThanOrEqual(15);
    expect(proposal.items.length).toBeLessThanOrEqual(19);
    expect(proposal.items.every((i) => [0, 1, 3, 5].includes(new Date(`${i.scheduledDate}T00:00:00Z`).getUTCDay()))).toBe(true);
    expect(proposal.items.every((i) => i.scheduledTime === "20:00" && i.status === "pending" && i.scheduledDate.startsWith(nextMonth))).toBe(true);
    expect(new Set(proposal.items.map((i) => i.funnelStage))).toEqual(new Set(["認知", "悩み", "教育", "信頼", "来店", "予約"]));
    expect((await repo.listPosts(org.id)).length).toBe(postsBefore); // nothing saved to the planner yet

    const threads = byHandle("@naoru_shibuya_threads");
    const tp = await generateMonthlyPlan(repo, org.id, brain, { accountId: threads.id, month: nextMonth, hqCampaignId: null, notes: "" });
    expect(tp.items.length).toBeGreaterThan(proposal.items.length); // 5/week on Threads
    expect(tp.items.every((i) => i.contentType === "threads_text" && i.scheduledTime === "12:00")).toBe(true);
  });

  it("uses a different funnel and content logic for recruitment", async () => {
    const { repo, org, brain, byHandle } = await setup("plan-2");
    const recruit = byHandle("@naoru_recruit");
    const proposal = await generateMonthlyPlan(repo, org.id, brain, { accountId: recruit.id, month: nextMonth, hqCampaignId: null, notes: "" });
    expect(proposal.items.length).toBeGreaterThanOrEqual(8);
    expect(proposal.items.length).toBeLessThanOrEqual(10);
    expect(proposal.items.at(-1)?.funnelStage).toBe("応募");
    expect(proposal.items.some((i) => ["before_after", "testimonial", "offer"].includes(i.contentType))).toBe(false);
    expect(proposal.items.every((i) => ["staff_story", "day_in_the_life", "training", "career", "benefits", "culture", "vision", "employee_voice"].includes(i.contentPillar))).toBe(true);

    const accCtxReq = buildMonthlyPlanRequest({ brain, account: byHandle("@naoru_shibuya"), location: null, campaign: null, pillars: SYSTEM_CONTENT_PILLARS, slots: [], month: nextMonth, notes: "" });
    const recCtxReq = buildMonthlyPlanRequest({ brain, account: recruit, location: null, campaign: null, pillars: SYSTEM_CONTENT_PILLARS, slots: [], month: nextMonth, notes: "" });
    expect(accCtxReq.system).toContain("集客アカウントの企画ルール");
    expect(accCtxReq.system).not.toContain("採用アカウントの企画ルール");
    expect(recCtxReq.system).toContain("採用アカウントの企画ルール");
    expect(recCtxReq.system).not.toContain("集客アカウントの企画ルール");
  });

  it("reflects the HQ campaign required message", async () => {
    const { repo, org, brain, byHandle } = await setup("plan-3");
    const [campaign] = await repo.listHqCampaigns(org.id);
    const proposal = await generateMonthlyPlan(repo, org.id, brain, { accountId: byHandle("@naoru_ikebukuro").id, month: nextMonth, hqCampaignId: campaign?.id ?? null, notes: "" });
    expect(proposal.hqCampaignId).toBe(campaign?.id);
    expect(proposal.items.some((i) => i.summary.includes("初回姿勢チェック無料") || i.theme.includes("初回姿勢チェック無料"))).toBe(true);
  });

  it("approve / reject / edit / regenerate — only approved items become planner posts", async () => {
    const { repo, org, brain, byHandle } = await setup("plan-4");
    const ig = byHandle("@naoru_yokohama");
    const proposal = await generateMonthlyPlan(repo, org.id, brain, { accountId: ig.id, month: nextMonth, hqCampaignId: null, notes: "" });
    const [first, second, third] = proposal.items;
    if (!first || !second || !third) throw new Error("too few items");

    const edited = await editPlanItem(repo, org.id, proposal.id, first.id, { theme: "横浜ママの肩こりケア" });
    expect(edited.theme).toBe("横浜ママの肩こりケア");
    const regenerated = await regeneratePlanItem(repo, org.id, brain, proposal.id, second.id, "", 1);
    expect(regenerated.theme).not.toBe(second.theme);
    expect(regenerated.scheduledDate).toBe(second.scheduledDate);

    const before = (await repo.listPosts(org.id)).length;
    await rejectPlanItems(repo, org.id, proposal.id, [third.id]);
    const r1 = await approvePlanItems(repo, org.id, proposal.id, [first.id]);
    expect(r1.approved).toBe(1);
    expect(r1.proposal.status).toBe("partially_approved");
    const posts = await repo.listPosts(org.id);
    expect(posts.length).toBe(before + 1);
    const post = posts.find((p) => p.planning.planItemId === first.id);
    expect(post?.title).toBe("横浜ママの肩こりケア");
    expect(post?.status).toBe("draft");
    expect(post?.source).toBe("ai_planner");
    expect(post?.accountId).toBe(ig.id);
    expect(post?.planning.funnelStage).toBe(first.funnelStage);

    // approved items can no longer be edited from the proposal; approving again is a no-op
    await expect(editPlanItem(repo, org.id, proposal.id, first.id, { theme: "x" })).rejects.toThrow();
    const r2 = await approvePlanItems(repo, org.id, proposal.id, null);
    expect(r2.approved).toBe(proposal.items.length - 2);
    expect((await repo.listPosts(org.id)).length).toBe(before + proposal.items.length - 1);
    expect(r2.proposal.status).toBe("partially_approved"); // one item stays rejected
    expect(r2.proposal.items.find((i) => i.id === third.id)?.status).toBe("rejected");
  });

  it("refuses past months", async () => {
    const { repo, org, brain, byHandle } = await setup("plan-5");
    await expect(generateMonthlyPlan(repo, org.id, brain, { accountId: byHandle("@naoru_shibuya").id, month: "2020-01", hqCampaignId: null, notes: "" })).rejects.toThrow();
  });
});

describe("operations overview + recommendations", () => {
  it("computes coverage per location / account and supports scopes", async () => {
    const { repo, org, accounts } = await setup("ops-1");
    const [locations, posts, campaigns] = await Promise.all([repo.listLocationProfiles(org.id), repo.listPosts(org.id), repo.listHqCampaigns(org.id)]);
    const all = computeOperationsOverview({ accounts, locations, posts, campaigns });
    expect(all.activeLocations).toBe(3);
    expect(all.activeAccounts).toBe(8);
    expect(all.recruitmentAccounts).toBe(2);
    expect(all.acquisitionAccounts).toBe(5);
    expect(all.locations.map((l) => l.name)).toEqual(["本部（HQ）", "NAORU整体 渋谷院", "NAORU整体 池袋院", "NAORU整体 横浜院"]);
    const shibuyaId = locations[0]!.locationId;
    const loc = computeOperationsOverview({ accounts, locations, posts, campaigns }, { kind: "location", id: shibuyaId });
    expect(loc.locations).toHaveLength(1);
    expect(loc.activeAccounts).toBe(2);

    const { object } = await new MockAIProvider().generateStructuredObject(buildOperationsReviewRequest(DEMO_BRAND_BRAIN, all));
    const inputs = toRecommendationInputs(object, accounts);
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.some((r) => r.socialAccountId !== null)).toBe(true);
  });

  it("recommendations move through pending → approved → completed", async () => {
    const { repo, org } = await setup("ops-2");
    const [rec] = await repo.listRecommendations(org.id);
    if (!rec) throw new Error("no rec");
    expect(rec.status).toBe("pending");
    expect((await repo.setRecommendationStatus(org.id, rec.id, "approved")).status).toBe("approved");
    expect((await repo.setRecommendationStatus(org.id, rec.id, "completed")).status).toBe("completed");
  });
});
