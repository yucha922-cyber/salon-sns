import { describe, expect, it } from "vitest";
import { DemoRepository } from "@/lib/data/demo-repository";
import { RepositoryError } from "@/lib/data/repository";
import { createDemoOrganization } from "@/lib/services/organizations";
import { localizeCampaign, pickAccountForLocation } from "@/lib/services/localization";
import { formatPortfolioContext, formatScopeContext } from "@/lib/brand/context";
import { buildPostCreatorRequest } from "@/lib/ai/prompts/post-creator";
import { buildAccountStrategyRequest } from "@/lib/ai/prompts/account-strategy";
import { MockAIProvider } from "@/lib/ai/mock";
import { DEMO_BRAND_BRAIN } from "@/lib/demo/seed";
import { hqCampaignInputSchema, snsAccountInputSchema } from "@/lib/domain/schemas";

async function demo(userId: string) {
  const repo = new DemoRepository(userId);
  const org = await createDemoOrganization(repo);
  const brain = await repo.getBrandBrain(org.id);
  if (!brain) throw new Error("no brain");
  return { repo, org, brain };
}

describe("demo organization: accounts / locations / HQ", () => {
  it("seeds accounts per goal without duplicating brand-default handles", async () => {
    const { repo, org } = await demo("hq-user-1");
    const accounts = await repo.listAccounts(org.id);
    const handles = accounts.map((a) => `${a.platform}:${a.handle}`);
    expect(new Set(handles).size).toBe(handles.length);
    expect(accounts.filter((a) => a.goal === "recruitment")).toHaveLength(1);
    expect(accounts.filter((a) => a.goal === "acquisition" && a.locationId)).toHaveLength(2);
    const official = accounts.find((a) => a.handle === "@naoru_official" && a.platform === "instagram");
    expect(official?.isBrandDefault).toBe(true);
    expect(official?.goal).toBe("branding");
    expect(official?.strategy.kpis.length).toBeGreaterThan(0);
  });

  it("keeps Brand Brain handles in sync with brand-default accounts", async () => {
    const { repo, org, brain } = await demo("hq-user-2");
    await repo.saveBrandBrain(org.id, { ...brain, social: { ...brain.social, threads: "", facebook: "@naoru_fb" } });
    const accounts = await repo.listAccounts(org.id);
    expect(accounts.some((a) => a.platform === "threads" && a.isBrandDefault)).toBe(false);
    expect(accounts.some((a) => a.platform === "facebook" && a.handle === "@naoru_fb")).toBe(true);
    expect(accounts.some((a) => a.handle === "@naoru_recruit")).toBe(true);
    expect((await repo.getBrandBrain(org.id))?.social.facebook).toBe("@naoru_fb");
  });

  it("localizes an HQ campaign into one draft per location", async () => {
    const { repo, org, brain } = await demo("hq-user-3");
    const [campaign] = await repo.listHqCampaigns(org.id);
    if (!campaign) throw new Error("no campaign");
    const result = await localizeCampaign(repo, org.id, brain, campaign);
    expect(result.skipped).toHaveLength(0);
    expect(result.created.map((c) => c.locationName).sort()).toEqual(["NAORU整体 新宿院", "NAORU整体 渋谷院"]);
    const shibuya = result.created.find((c) => c.locationName.includes("渋谷"));
    expect(shibuya?.accountHandle).toBe("@naoru_shibuya");
    expect(shibuya?.post.hashtags).toContain("#渋谷整体");
    expect(shibuya?.post.caption).toContain("平日19時以降");
    expect(shibuya?.post.status).toBe("draft");
    expect(shibuya?.post.hqCampaignId).toBe(campaign.id);
    expect(shibuya?.post.cta).toBe("LINEで24時間予約受付中");
  });

  it("isolates accounts, profiles and campaigns between organizations", async () => {
    const a = await demo("hq-user-a");
    const b = new DemoRepository("hq-user-b");
    const orgB = await b.createOrganization("B");
    const [accountA] = await a.repo.listAccounts(a.org.id);
    const locationA = a.brain.locations[0]?.id ?? "";
    await expect(b.listAccounts(a.org.id)).rejects.toBeInstanceOf(RepositoryError);
    await expect(b.listHqCampaigns(a.org.id)).rejects.toBeInstanceOf(RepositoryError);
    // B cannot reference A's location / account from its own org
    await expect(b.saveLocationProfile(orgB.id, locationA, { area: "x", demographics: "", featuredServices: [], staff: [], offers: [], localKeywords: [] }))
      .rejects.toBeInstanceOf(RepositoryError);
    await expect(
      b.createPost(orgB.id, { platform: "instagram", contentType: "feed", title: "x", caption: "", cta: "", hashtags: [], status: "draft", scheduledAt: null, source: "manual", accountId: accountA?.id }),
    ).rejects.toBeInstanceOf(RepositoryError);
    await expect(
      b.saveHqCampaign(orgB.id, null, { name: "x", status: "draft", startsOn: null, endsOn: null, sharedTheme: "t", creative: { headline: "", body: "", visual: "" }, localizationRules: [], targetLocationIds: [locationA] }),
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
    expect(formatPortfolioContext(accounts, locations)).toContain("@naoru_recruit");

    const req = buildPostCreatorRequest(DEMO_BRAND_BRAIN, { platform: "instagram", contentType: "feed", theme: "t", target: "", goal: "", tone: "", notes: "" }, { account, location: locations[0], campaign: campaigns[0] });
    expect(req.system).toContain("Localization Rulesに必ず従って");
  });

  it("suggests a recruitment strategy aimed at job seekers", async () => {
    const { object } = await new MockAIProvider().generateStructuredObject(
      buildAccountStrategyRequest(DEMO_BRAND_BRAIN, { platform: "instagram", goal: "recruitment", handle: "@x" }, null),
    );
    expect(object.kpis).toContain("応募数");
    expect(object.persona).toContain("セラピスト");
  });

  it("validates inputs", () => {
    expect(snsAccountInputSchema.safeParse({ platform: "instagram", handle: "", displayName: "", locationId: null, goal: "acquisition", strategy: { persona: "", kpis: [], contentPillars: [], postsPerWeek: 3, postingFrequencyNote: "", cta: "", tone: "" } }).success).toBe(false);
    expect(hqCampaignInputSchema.safeParse({ name: "x", status: "draft", startsOn: "2026-10-10", endsOn: "2026-10-01", sharedTheme: "t", creative: { headline: "", body: "", visual: "" }, localizationRules: [], targetLocationIds: [] }).success).toBe(false);
  });
});
