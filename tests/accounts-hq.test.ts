import { describe, expect, it } from "vitest";
import { DemoRepository } from "@/lib/data/demo-repository";
import { deterministicIds } from "@/lib/data/demo-store";
import { RepositoryError } from "@/lib/data/repository";
import { createDemoOrganization } from "@/lib/services/organizations";
import { localizeCampaign, pickAccountForLocation } from "@/lib/services/localization";
import { formatPortfolioContext, formatScopeContext } from "@/lib/brand/context";
import { buildPostCreatorRequest } from "@/lib/ai/prompts/post-creator";
import { buildAccountStrategistRequest } from "@/lib/ai/prompts/account-strategy";
import { strategyFromProposal } from "@/lib/brand/apply-strategy";
import { MockAIProvider } from "@/lib/ai/mock";
import { DEMO_BRAND_BRAIN } from "@/lib/demo/seed";
import { presetStrategy } from "@/lib/brand/account-goals";
import { SYSTEM_CONTENT_PILLARS } from "@/lib/brand/content-pillars";
import { hqCampaignInputSchema, snsAccountInputSchema } from "@/lib/domain/schemas";
import type { HqCampaignInput } from "@/lib/domain/types";

async function demo(userId: string) {
  const repo = new DemoRepository(userId);
  const org = await createDemoOrganization(repo);
  const brain = await repo.getBrandBrain(org.id);
  if (!brain) throw new Error("no brain");
  return { repo, org, brain };
}

const emptyCampaign = (patch: Partial<HqCampaignInput> = {}): HqCampaignInput => ({
  name: "x",
  status: "draft",
  goal: "acquisition",
  startsOn: null,
  endsOn: null,
  sharedTheme: "t",
  contentDirections: [],
  requiredMessages: [],
  optionalMessages: [],
  cta: "",
  creative: { headline: "", body: "", visual: "" },
  localizationRules: [],
  targetLocationIds: [],
  targetPlatforms: [],
  ...patch,
});

describe("NAORU Demo HQ", () => {
  it("is seeded with identical ids on every server instance (deterministic seed)", async () => {
    const seed = async () => {
      // Simulate a fresh server instance: empty in-memory store.
      (globalThis as { __naoruDemoStore?: unknown }).__naoruDemoStore = undefined;
      const repo = new DemoRepository("00000000-0000-4000-8000-00000000d3e0", deterministicIds("naoru-demo-hq"));
      const org = await createDemoOrganization(repo);
      return { org, accounts: await repo.listAccounts(org.id), posts: await repo.listPosts(org.id) };
    };
    const a = await seed();
    const b = await seed();
    expect(a.org.id).toBe(b.org.id);
    expect(a.accounts.map((x) => x.id).sort()).toEqual(b.accounts.map((x) => x.id).sort());
    expect(a.posts.map((x) => x.id).sort()).toEqual(b.posts.map((x) => x.id).sort());
  });

  it("has 3 locations with Instagram + Threads each, and HQ accounts", async () => {
    const { repo, org, brain } = await demo("hq-user-1");
    expect(org.name).toBe("NAORU Demo HQ");
    expect(org.isDemo).toBe(true);
    expect(brain.locations.map((l) => l.name)).toEqual(["NAORU整体 渋谷院", "NAORU整体 池袋院", "NAORU整体 横浜院"]);
    const accounts = await repo.listAccounts(org.id);
    for (const loc of brain.locations) {
      const platforms = accounts.filter((a) => a.locationId === loc.id).map((a) => a.platform).sort();
      expect(platforms).toEqual(["instagram", "threads"]);
    }
    const hq = accounts.filter((a) => a.locationId === null);
    expect(hq.map((a) => `${a.platform}:${a.goal}`).sort()).toEqual(["instagram:recruitment", "threads:recruitment"]);
    const handles = accounts.map((a) => `${a.platform}:${a.handle}`);
    expect(new Set(handles).size).toBe(handles.length);
    const shibuya = accounts.find((a) => a.handle === "@naoru_shibuya");
    expect(shibuya?.goal).toBe("acquisition");
    expect(shibuya?.strategy.targetAudience).toContain("渋谷勤務");
    expect(shibuya?.strategy.kpiTargets.map((k) => k.metric)).toEqual(["プロフィールアクセス", "LINE登録", "予約数"]);
    const recruit = accounts.find((a) => a.handle === "@naoru_recruit");
    expect(recruit?.strategy.targetAudience).toContain("理学療法士");
    expect(recruit?.strategy.contentPillars).toContain("day_in_the_life");
    expect((await repo.listRecommendations(org.id)).filter((r) => r.status === "pending")).toHaveLength(5);
    // 10–20 planner posts this month, acquisition + recruitment
    const posts = await repo.listPosts(org.id);
    expect(posts.length).toBeGreaterThanOrEqual(10);
    expect(posts.length).toBeLessThanOrEqual(20);
    const goals = new Set(posts.map((p) => accounts.find((a) => a.id === p.accountId)?.goal));
    expect(goals.has("acquisition") && goals.has("recruitment")).toBe(true);
    expect(posts.some((p) => p.title === "肩こりが治らない人のNG習慣3選" && p.contentType === "reel")).toBe(true);
  });

  it("keeps Brand Brain handles in sync with brand-default accounts", async () => {
    const { repo, org, brain } = await demo("hq-user-2");
    await repo.saveBrandBrain(org.id, { ...brain, social: { ...brain.social, facebook: "@naoru_fb" } });
    const accounts = await repo.listAccounts(org.id);
    expect(accounts.some((a) => a.platform === "facebook" && a.handle === "@naoru_fb" && a.isBrandDefault)).toBe(true);
    expect(accounts.some((a) => a.handle === "@naoru_recruit")).toBe(true);
    expect((await repo.getBrandBrain(org.id))?.social.facebook).toBe("@naoru_fb");
  });

  it("localizes the HQ theme per location and per target platform", async () => {
    const { repo, org, brain } = await demo("hq-user-3");
    const [campaign] = await repo.listHqCampaigns(org.id);
    if (!campaign) throw new Error("no campaign");
    expect(campaign.targetPlatforms).toEqual(["instagram", "threads"]);
    const result = await localizeCampaign(repo, org.id, brain, campaign);
    expect(result.skipped).toHaveLength(0);
    // 3 locations × (Instagram + Threads acquisition) — Yokohama Threads is a retention account but still non-recruitment
    expect(result.created).toHaveLength(6);
    const shibuyaIg = result.created.find((c) => c.accountHandle === "@naoru_shibuya");
    expect(shibuyaIg?.post.hashtags).toContain("#渋谷整体");
    expect(shibuyaIg?.post.caption).toContain("初回姿勢チェック無料");
    expect(shibuyaIg?.post.caption).toContain("平日19時以降");
    const ikebukuro = result.created.find((c) => c.accountHandle === "@naoru_ikebukuro");
    expect(ikebukuro?.post.caption).toContain("池袋");
    expect(result.created.some((c) => c.accountHandle === "@naoru_recruit")).toBe(false);
  });

  it("isolates accounts, proposals, recommendations and campaigns between organizations", async () => {
    const a = await demo("hq-user-a");
    const b = new DemoRepository("hq-user-b");
    const orgB = await b.createOrganization("B");
    const [accountA] = await a.repo.listAccounts(a.org.id);
    const locationA = a.brain.locations[0]?.id ?? "";
    await expect(b.listAccounts(a.org.id)).rejects.toBeInstanceOf(RepositoryError);
    await expect(b.listRecommendations(a.org.id)).rejects.toBeInstanceOf(RepositoryError);
    await expect(b.listPlanProposals(a.org.id)).rejects.toBeInstanceOf(RepositoryError);
    await expect(b.saveLocationProfile(orgB.id, locationA, { area: "x", demographics: "", featuredServices: [], staff: [], offers: [], localKeywords: [] }))
      .rejects.toBeInstanceOf(RepositoryError);
    await expect(
      b.createPost(orgB.id, { platform: "instagram", contentType: "feed", title: "x", caption: "", cta: "", hashtags: [], status: "draft", scheduledAt: null, source: "manual", accountId: accountA?.id }),
    ).rejects.toBeInstanceOf(RepositoryError);
    await expect(b.saveHqCampaign(orgB.id, null, emptyCampaign({ targetLocationIds: [locationA] }))).rejects.toBeInstanceOf(RepositoryError);
    await expect(
      b.createPlanProposal(orgB.id, { accountId: accountA?.id ?? "", locationId: null, hqCampaignId: null, month: "2026-11", goal: "acquisition", summary: "", aiProvider: "mock", items: [] }),
    ).rejects.toBeInstanceOf(RepositoryError);
  });
});

describe("AI context for accounts / locations / HQ", () => {
  it("adds strategy, location and localization sections in a fixed order", async () => {
    const { repo, org } = await demo("hq-user-4");
    const [accounts, locations, campaigns] = await Promise.all([repo.listAccounts(org.id), repo.listLocationProfiles(org.id), repo.listHqCampaigns(org.id)]);
    const account = pickAccountForLocation(accounts, locations[0]?.locationId ?? "");
    const text = formatScopeContext({ account, location: locations[0], campaign: campaigns[0] });
    const order = ["## Account Strategy", "## Location Customization", "## HQ Campaign", "## Localization Rules"].map((h) => text.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(text).toContain("必須メッセージ「初回姿勢チェック無料」");
    expect(text).toContain("お悩み共感"); // pillar keys are rendered as labels
    expect(formatPortfolioContext(accounts, locations)).toContain("@naoru_recruit");

    const req = buildPostCreatorRequest(DEMO_BRAND_BRAIN, { platform: "instagram", contentType: "feed", theme: "t", target: "", goal: "", tone: "", notes: "" }, { account, location: locations[0], campaign: campaigns[0] });
    expect(req.system).toContain("Localization Rulesに必ず従って");
  });
});

describe("AI Account Strategist", () => {
  const ai = new MockAIProvider();
  const base = { handle: "@x", customGoal: "", strategy: presetStrategy("acquisition") };

  it("returns a validated structured strategy for acquisition", async () => {
    const { object } = await ai.generateStructuredObject(
      buildAccountStrategistRequest(DEMO_BRAND_BRAIN, { ...base, platform: "instagram", goal: "acquisition" }, null, SYSTEM_CONTENT_PILLARS),
    );
    expect(object.primaryKpi.metric).toBe("予約数");
    expect(object.monthlyContentMix.reduce((n, m) => n + m.sharePercent, 0)).toBe(100);
    expect(object.risks.length).toBeGreaterThan(0);
    const applied = strategyFromProposal(object, presetStrategy("acquisition"), SYSTEM_CONTENT_PILLARS);
    expect(applied.contentPillars).toContain("problem_awareness");
    expect(applied.kpiTargets[0]?.metric).toBe("予約数");
  });

  it("targets job seekers for recruitment and uses a different system prompt", async () => {
    const recruitmentReq = buildAccountStrategistRequest(DEMO_BRAND_BRAIN, { ...base, platform: "instagram", goal: "recruitment" }, null);
    const acquisitionReq = buildAccountStrategistRequest(DEMO_BRAND_BRAIN, { ...base, platform: "instagram", goal: "acquisition" }, null);
    expect(recruitmentReq.system).toContain("求職者");
    expect(recruitmentReq.system).toContain("職場理解");
    expect(acquisitionReq.system).not.toContain("職場理解");
    const { object } = await ai.generateStructuredObject(recruitmentReq);
    expect(object.primaryKpi.metric).toBe("応募数");
    expect(object.targetAudience).toContain("理学療法士");
  });
});

describe("validation", () => {
  it("rejects invalid account / campaign input", () => {
    const strategy = { ...presetStrategy("acquisition") };
    expect(snsAccountInputSchema.safeParse({ platform: "instagram", handle: "", displayName: "", locationId: null, goal: "acquisition", customGoal: "", active: true, strategy }).success).toBe(false);
    expect(snsAccountInputSchema.safeParse({ platform: "instagram", handle: "@a", displayName: "", locationId: null, goal: "sales", customGoal: "", active: true, strategy }).success).toBe(false);
    expect(snsAccountInputSchema.safeParse({ platform: "instagram", handle: "@a", displayName: "", locationId: null, goal: "acquisition", customGoal: "", active: true, strategy: { ...strategy, preferredPostingTimes: ["25:00"] } }).success).toBe(false);
    expect(hqCampaignInputSchema.safeParse(emptyCampaign({ startsOn: "2026-10-10", endsOn: "2026-10-01" })).success).toBe(false);
  });
});
