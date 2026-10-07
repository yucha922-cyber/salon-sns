import { describe, expect, it } from "vitest";
import type { AppContext } from "@/lib/auth/context";
import { DemoRepository } from "@/lib/data/demo-repository";
import { DemoAdsStore } from "@/lib/ads/demo-store";
import { DemoSocialStore } from "@/lib/social/demo-store";
import { createDemoOrganization } from "@/lib/services/organizations";
import { createExperiment, generateDrafts, getHypothesisContext, loadAdsPageData, recordConversions, reviewDraft, runExperimentCommand } from "@/lib/ads/app";
import { MockAdsProvider } from "@/lib/ads/mock";
import { syncAdAccount } from "@/lib/ads/sync";
import { refreshExperiment } from "@/lib/ads/experiment-service";
import { evaluateExperiment, DEFAULT_CRITERIA } from "@/lib/ads/experiments";
import { checkAdCopy, similarity } from "@/lib/ads/policy";
import { parseConversionCsv } from "@/lib/ads/conversions";
import { buildDashboard } from "@/lib/ads/views";
import { AdsStoreError } from "@/lib/ads/store";

const ads = new DemoAdsStore();
const social = new DemoSocialStore();

async function setup(userId: string) {
  const repo = new DemoRepository(userId);
  const org = await createDemoOrganization(repo, { social, ads });
  const memberships = await repo.listMemberships();
  const current = memberships.find((m) => m.organization.id === org.id);
  const brain = await repo.getBrandBrain(org.id);
  if (!current || !brain) throw new Error("setup failed");
  const app: AppContext = { user: { id: userId, email: `${userId}@example.com`, displayName: "テスト" }, repo, memberships, current, brain };
  return { org, app, repo };
}

const withRole = (app: AppContext, role: AppContext["current"]["role"], locationIds: string[] | null = null): AppContext => ({ ...app, current: { ...app.current, role, locationIds } });

describe("ads demo seed (NAORU × Meta)", () => {
  it("connects the mock account and syncs 30 days of daily snapshots for every level", async () => {
    const { org } = await setup("ads-seed-1");
    const [account] = await ads.listAdAccounts(org.id);
    expect(account?.connectionStatus).toBe("connected");
    expect(await ads.getAdCredential(org.id, account!.id)).toMatchObject({ accessToken: "mock_demo_ads_token" });
    const campaigns = await ads.listCampaigns(org.id);
    expect(campaigns.map((c) => c.name)).toContain("渋谷院 新規集客");
    expect(campaigns.find((c) => c.name === "本部 セラピスト採用")?.goal).toBe("recruitment");
    expect(campaigns.find((c) => c.name === "渋谷院 新規集客")?.locationId).toBeTruthy();
    const snaps = await ads.listSnapshots(org.id);
    for (const type of ["account", "campaign", "ad_set", "ad"] as const) expect(snaps.filter((s) => s.entityType === type).length).toBeGreaterThan(20);
    const dates = new Set(snaps.filter((s) => s.entityType === "account").map((s) => s.date));
    expect(dates.size).toBe(30);
  });

  it("detects fatigue on Creative A with the multi-signal explanation and an LP problem on E", async () => {
    const { app } = await setup("ads-seed-2");
    const { findings } = await loadAdsPageData(app);
    const fatigue = findings.find((f) => f.kind === "creative_fatigue");
    expect(fatigue?.entityName).toMatch(/^A｜/);
    expect(fatigue?.observation).toMatch(/Frequency.*→.*CTR/);
    const lp = findings.find((f) => f.kind === "lp_cvr_drop");
    expect(lp?.suggestedVariable).toBe("landing_page");
    expect(findings.some((f) => f.kind === "underdelivery")).toBe(true);
  });

  it("keeps the Shibuya A/B test running with insufficient data and completed the recruitment test with a winner + Creative Memory", async () => {
    const { org } = await setup("ads-seed-3");
    const exps = await ads.listExperiments(org.id);
    const shibuya = exps.find((e) => e.name.startsWith("渋谷院"));
    expect(shibuya?.status).toBe("running");
    expect(shibuya?.resultSummary?.decision).toBe("insufficient_data");
    expect(shibuya?.resultSummary?.missing.length).toBeGreaterThan(0);
    const recruit = exps.find((e) => e.name.startsWith("本部"));
    expect(recruit?.status).toBe("completed");
    expect(recruit?.decision).toBe("winner");
    const learnings = (await social.listLearnings(org.id)).filter((l) => l.kind === "creative");
    const fromTest = learnings.find((l) => l.sourceExperimentId === recruit?.id);
    expect(fromTest?.attributes?.winningPattern).toBe("NAORUで働くセラピストの1日");
    expect(fromTest?.attributes?.variable).toBe("hook");
  });
});

describe("Human-in-the-loop creative test", () => {
  it("runs hypothesis → drafts → approve → test → final confirmation → metrics → winner → learning", async () => {
    const { org, app, repo } = await setup("ads-loop-1");
    // The dashboard recommendation for D (winning creative) links a hypothesis.
    const rec = (await repo.listRecommendations(org.id)).find((r) => r.source === "ads" && r.payload?.findingKind === "winning_creative" && String(r.title).startsWith("D"));
    const hypothesisId = String(rec?.payload?.hypothesisId);
    const ctx = await getHypothesisContext(app, hypothesisId);
    expect(ctx?.campaignName).toBe("池袋院 新規集客");
    expect(ctx?.control?.hook).toBe("昼休み30分で、午後の体を軽く");

    // AI drafts: B / C, in_review, never published, principle re-expressed (not copied).
    const drafted = await generateDrafts(app, hypothesisId, false);
    expect(drafted.drafts).toHaveLength(2);
    if (process.env.SHOW_DRAFTS) console.log(JSON.stringify(drafted.drafts.map((d) => ({ hook: d.hook, headline: d.headline, text: d.primaryText, angle: d.angle, visual: d.visualDirection, brief: d.brief })), null, 1));
    expect(drafted.drafts.every((d) => d.status === "in_review" && d.externalId === null)).toBe(true);
    expect(drafted.drafts.every((d) => similarity(d.hook, "昼休み30分で、午後の体を軽く") < 0.6)).toBe(true);
    expect(drafted.drafts[0]?.brief?.forbiddenExpressions.length).toBeGreaterThan(0);
    for (const d of drafted.drafts) expect(checkAdCopy(d).filter((w) => w.level === "warn")).toEqual([]);

    // Regenerate replaces the open drafts.
    const regen = await generateDrafts(app, hypothesisId, true);
    expect(regen.drafts.map((d) => d.id)).not.toEqual(drafted.drafts.map((d) => d.id));

    // Unapproved creatives cannot enter a test.
    await expect(createExperiment(app, hypothesisId, [regen.drafts[0]!.id])).rejects.toThrow(/承認済み/);
    // Viewer cannot approve.
    await expect(reviewDraft(withRole(app, "viewer"), regen.drafts[0]!.id, { action: "approve" })).rejects.toThrow(/閲覧権限/);
    const edited = await reviewDraft(app, regen.drafts[0]!.id, { action: "edit", patch: { headline: "昼休みに、首肩をリセット" } });
    expect(edited.status).toBe("in_review");
    const approved = await reviewDraft(app, regen.drafts[0]!.id, { action: "approve" });
    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).toBe("ads-loop-1");
    await reviewDraft(app, regen.drafts[1]!.id, { action: "reject", reason: "トーンが合わない" });

    // Draft → approve → final confirmation.
    const exp = await createExperiment(app, hypothesisId, [approved.id]);
    expect(exp.status).toBe("draft");
    expect(exp.variants.map((v) => `${v.role}:${v.label}`)).toEqual(["control:A", "challenger:B"]);
    // Launch is impossible before approval, and plain editors cannot send to Meta.
    await expect(runExperimentCommand(app, exp.id, "launch_start")).rejects.toThrow(/承認済み/);
    await runExperimentCommand(app, exp.id, "approve");
    await expect(runExperimentCommand(withRole(app, "editor"), exp.id, "launch_start")).rejects.toThrow(/管理者/);
    const launched = await runExperimentCommand(app, exp.id, "launch_start");
    expect(launched?.status).toBe("running");
    const challenger = launched?.variants.find((v) => v.role === "challenger");
    expect(challenger?.providerAdId).toMatch(/^mockad_/);
    expect((await ads.getCreative(org.id, approved.id))?.status).toBe("published");
    // Double launch is rejected.
    await expect(runExperimentCommand(app, exp.id, "launch_start")).rejects.toThrow();

    // Two weeks later: sync + refresh → evaluate.
    const future = new Date(Date.now() + 15 * 86_400_000);
    const [account] = await ads.listAdAccounts(org.id);
    await syncAdAccount(ads, new MockAdsProvider(() => future), account!, { now: future, days: 28 });
    const refreshed = await refreshExperiment(ads, org.id, exp.id, future);
    const b = refreshed?.variants.find((v) => v.label === "B");
    expect(b?.impressions).toBeGreaterThan(0);
    expect(refreshed?.resultSummary?.decision).toBeDefined();
  });

  it("records first-party conversions separately and enforces organization isolation", async () => {
    const { org, app } = await setup("ads-loop-2");
    const other = await setup("ads-loop-3");
    const csv = "date,kind,count,campaign,note\n2026-10-01,予約,3,渋谷院 新規集客,電話予約\n2026-10-02,reservation,x,,\n";
    const r = await recordConversions(app, { mode: "csv", csv });
    expect(r.saved).toBe(1);
    expect(r.errors.some((e) => e.includes("3行目"))).toBe(true);
    expect((await ads.listConversions(org.id)).length).toBe(1);
    expect((await ads.listConversions(other.org.id)).length).toBe(0);
    // Another org's hypothesis / experiment is invisible.
    const foreign = (await ads.listExperiments(other.org.id))[0];
    await expect(runExperimentCommand(app, foreign!.id, "refresh")).rejects.toBeInstanceOf(AdsStoreError);
    expect(await getHypothesisContext(app, (await ads.listHypotheses(other.org.id))[0]!.id)).toBeNull();
  });

  it("location managers only see their own location's campaigns", async () => {
    const { app } = await setup("ads-loop-4");
    const shibuya = app.brain.locations[0]?.id as string;
    const { ws } = await loadAdsPageData(withRole(app, "editor", [shibuya]));
    expect(ws.campaigns.map((c) => c.name)).toEqual(["渋谷院 新規集客"]);
    expect(ws.snapshots.some((s) => s.entityType === "account")).toBe(false);
  });
});

describe("pure parts", () => {
  it("never forces a winner on thin data", () => {
    const m = (spend: number, impressions: number, clicks: number, conversions: number) => ({ spend, impressions, clicks, conversions, revenue: null, frequency: 2, ctr: clicks / impressions, cvr: conversions / clicks, cpa: spend / conversions, roas: null });
    const thin = evaluateExperiment({ primaryMetric: "cpa", criteria: DEFAULT_CRITERIA.acquisition, startDate: "2026-10-01", variants: [{ label: "A", role: "control", metrics: m(10000, 3000, 40, 4) }, { label: "B", role: "challenger", metrics: m(10000, 3000, 60, 9) }] }, new Date("2026-10-05T00:00:00Z"));
    expect(thin.decision).toBe("insufficient_data");
    const close = evaluateExperiment({ primaryMetric: "cpa", criteria: DEFAULT_CRITERIA.acquisition, startDate: "2026-09-01", variants: [{ label: "A", role: "control", metrics: m(40000, 20000, 300, 30) }, { label: "B", role: "challenger", metrics: m(40000, 20000, 310, 32) }] }, new Date("2026-10-01T00:00:00Z"));
    expect(close.decision).toBe("inconclusive");
    const clear = evaluateExperiment({ primaryMetric: "cpa", criteria: DEFAULT_CRITERIA.acquisition, startDate: "2026-09-01", variants: [{ label: "A", role: "control", metrics: m(40000, 20000, 300, 20) }, { label: "B", role: "challenger", metrics: m(40000, 20000, 320, 40) }] }, new Date("2026-10-01T00:00:00Z"));
    expect(clear.decision).toBe("winner");
    expect(clear.winnerLabel).toBe("B");
  });

  it("flags personal-attribute and medical-claim wording", () => {
    expect(checkAdCopy({ headline: "肩こりに悩むあなたへ" }).map((w) => w.code)).toContain("personal_attributes");
    expect(checkAdCopy({ headline: "その肩こり、揉むだけになっていませんか？" }).map((w) => w.code)).toContain("personal_attributes");
    expect(checkAdCopy({ primaryText: "肩こりが必ず治る" }).map((w) => w.code)).toEqual(expect.arrayContaining(["health_claim", "absolute"]));
    expect(checkAdCopy({ headline: "定時後の30分で、首肩をリセット" })).toEqual([]);
    expect(checkAdCopy({ headline: "20代女性限定で募集" }).map((w) => w.code)).toContain("employment");
  });

  it("parses conversion CSV with aliases and validation", () => {
    const { rows, errors } = parseConversionCsv("date,kind,count,revenue\n2026/10/01,来店,2,17600\nbad,lead,1,\n");
    expect(rows).toEqual([{ occurredOn: "2026-10-01", kind: "visit", count: 2, revenue: 17600, campaign: "", note: "" }]);
    expect(errors).toHaveLength(1);
  });

  it("dashboard KPIs compare the last 7 days with the previous 7", async () => {
    const { app } = await setup("ads-loop-5");
    const data = await loadAdsPageData(app);
    const view = buildDashboard(data.ws, { goal: "acquisition", findings: data.findings, experiments: data.experiments, conversions: [] });
    expect(view.kpis.map((k) => k.label)).toEqual(["Spend（費用）", "予約CV", "CPA", "CTR", "CVR", "ROAS"]);
    expect(view.kpis[0]?.change).not.toBeNull();
    expect(view.runningTests.some((e) => e.name.startsWith("渋谷院"))).toBe(true);
    expect(view.attention[0]?.priority).toBeLessThan(view.attention[view.attention.length - 1]?.priority ?? 99);
    const recruit = buildDashboard(data.ws, { goal: "recruitment", findings: data.findings, experiments: data.experiments, conversions: [] });
    expect(recruit.kpis.map((k) => k.label)).toContain("応募単価");
  });
});
