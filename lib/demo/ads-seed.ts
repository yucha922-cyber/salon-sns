import "server-only";
import { runAdAnalysis } from "@/lib/ads/analysis";
import { completeExperiment, refreshExperiment } from "@/lib/ads/experiment-service";
import { DEFAULT_CRITERIA } from "@/lib/ads/experiments";
import { addDays } from "@/lib/ads/metrics";
import { MockAdsProvider, mockToday } from "@/lib/ads/mock";
import { MOCK_ACCOUNT, MOCK_AD_SETS, MOCK_ADS, MOCK_CAMPAIGNS } from "@/lib/ads/mock/data";
import type { AdsStore } from "@/lib/ads/store";
import { syncAdAccount } from "@/lib/ads/sync";
import type { DataRepository } from "@/lib/data/repository";
import type { ID } from "@/lib/domain/types";
import type { SocialStore } from "@/lib/social/store";

const PAIN: Record<string, string> = { A: "肩こり", B: "肩こり", C: "肩こり", D: "肩こり", E: "腰痛", F: "産後の骨盤", G: "", H: "", I: "" };

/**
 * NAORU Demo HQ × Meta広告 (MockAdsProvider, nothing reaches Meta):
 *   - mock ad account connected; 30 days of daily Insights synced
 *   - 渋谷院: Creative A「その肩こり、揉むだけ…」(fatigued) vs B「仕事終わり…」 A/B test running
 *   - 本部採用: H(研修) vs G(社員ストーリー) test completed → winner + Creative Memory
 *   - Creative Memory principle from 池袋 (生活シーンのHook)
 *   - AI analysis → hypotheses → dashboard recommendations
 */
export async function seedDemoAds(store: AdsStore, social: SocialStore | null, repo: DataRepository, organizationId: ID, actorUserId: ID | null, now: Date = new Date()): Promise<void> {
  if ((await store.listAdAccounts(organizationId)).length) return;
  const brain = await repo.getBrandBrain(organizationId);
  if (!brain) return;
  const locationIds = brain.locations.map((l) => l.id ?? null);
  const provider = new MockAdsProvider(() => now);

  const account = await store.upsertAdAccount({
    organizationId,
    brandId: null,
    locationId: null,
    provider: "meta",
    businessId: MOCK_ACCOUNT.businessId,
    externalAccountId: MOCK_ACCOUNT.externalAccountId,
    name: MOCK_ACCOUNT.name,
    currency: MOCK_ACCOUNT.currency,
    timezone: MOCK_ACCOUNT.timezone,
    accountStatus: MOCK_ACCOUNT.accountStatus,
    connectionStatus: "connected",
    scopes: ["ads_read", "ads_management", "business_management"],
    tokenExpiresAt: new Date(now.getTime() + 55 * 86_400_000).toISOString(),
    lastSyncedAt: null,
    connectionError: null,
    metadata: { business_name: MOCK_ACCOUNT.businessName, mock: true },
  });
  await store.saveAdCredential(organizationId, account.id, { accessToken: "mock_demo_ads_token", expiresAt: account.tokenExpiresAt, scopes: account.scopes });
  await syncAdAccount(store, provider, account, {
    now,
    days: 30,
    actorUserId,
    locationFor: (c) => {
      const idx = MOCK_CAMPAIGNS.find((m) => m.externalId === c.externalId)?.locationIndex;
      return idx === null || idx === undefined ? null : (locationIds[idx] ?? null);
    },
  });

  // Annotate synced creatives (in production a human / AI tags hook, angle, persona once).
  const [ads, creatives] = await Promise.all([store.listAds(organizationId), store.listCreatives(organizationId)]);
  const adByKey = new Map<string, (typeof ads)[number]>();
  for (const m of MOCK_ADS) {
    const ad = ads.find((a) => a.externalId === m.externalId);
    const cr = creatives.find((c) => c.externalId === m.creativeExternalId);
    if (ad) adByKey.set(m.key, ad);
    if (!cr) continue;
    const audience = MOCK_AD_SETS.find((s) => s.externalId === m.adSetExternalId)?.audienceLabel ?? "";
    await store.updateCreative(organizationId, cr.id, {
      hook: m.hook,
      angle: m.angle as never,
      persona: audience,
      painPoint: PAIN[m.key] ?? "",
      firstViewCopy: m.hook,
      visualDirection: m.format === "video" ? "縦型動画・実写" : "実写写真（院内・人物）",
      locationId: ad?.locationId ?? null,
    });
  }

  // Creative Memory from an earlier (pre-demo) Ikebukuro test.
  if (social) {
    await social.addLearning(
      organizationId,
      {
        locationId: locationIds[1] ?? null,
        socialAccountId: null,
        platform: null,
        goal: "acquisition",
        contentPillar: "ad:hook",
        hypothesis: "悩みを直接言うより、生活シーン（時間帯）を具体的に描いた方がクリックと予約につながる",
        result: "池袋院: 「昼休み30分で、午後の体を軽く」が悩み訴求のHookより予約単価が24%良かった（4週間）",
        learning: "集客（デスクワーカー）: 生活シーン・時間帯を具体的に描いたHookが、悩みを直接言うHookより予約単価が良い。",
        confidence: 0.68,
        validFrom: addDays(mockToday(now), -40),
        validUntil: addDays(mockToday(now), 140),
        sourcePostIds: [],
        sourceReviewId: null,
        kind: "creative",
        sourceExperimentId: null,
        attributes: {
          goal: "acquisition",
          variable: "hook",
          persona: "30代 デスクワーク",
          painPoint: "肩こり",
          hook: "昼休み30分で、午後の体を軽く",
          angle: "lifestyle",
          format: "video",
          platform: "meta",
          location: brain.locations[1]?.name ?? "",
          industry: brain.industry.label,
          winningPattern: "昼休み30分で、午後の体を軽く",
          losingPattern: "肩こり、放っておいていませんか？",
          principle: "生活シーン（時間帯・場面）を具体的に描く",
          why: "見る人が自分の1日に当てはめやすく、症状を断定しないためポリシー上も安全",
        },
      },
      actorUserId,
    );
  }

  const deps = { store, social, brain, organizationId, actorUserId, isDemo: true };
  const today = mockToday(now);
  const zero = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: null, frequency: null, ctr: null, cvr: null, cpa: null, roas: null };
  const creativeOf = (key: string) => adByKey.get(key)?.creativeId ?? null;
  const variant = (role: "control" | "challenger", label: string, key: string, change: string) => {
    const ad = adByKey.get(key);
    return { role, label, creativeId: creativeOf(key), adId: ad?.id ?? null, providerAdId: ad?.externalId ?? null, variableChanged: change, ...zero };
  };
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();

  // 本部採用: H (研修) → G (社員ストーリー) — completed, winner + learning.
  const G = adByKey.get("G");
  const H = adByKey.get("H");
  if (G && H) {
    const [hyp] = await store.addHypotheses([
      {
        organizationId,
        locationId: null,
        analysisId: null,
        campaignId: H.campaignId,
        adSetId: H.adSetId,
        adId: H.id,
        goal: "recruitment",
        problem: "研修制度の訴求は応募率が伸びず、応募単価が高い",
        hypothesis: "制度の説明より、実際に働くセラピストの1日を見せた方が『自分が働く姿』を想像でき、応募につながる",
        changeVariable: "hook",
        testIdea: "研修訴求（H）をControl、社員ストーリー動画（G）をChallengerにして同じ広告セットで比較",
        expectedResult: "応募単価 15%以上改善",
        primaryMetric: "application_cpa",
        confidence: 0.6,
        status: "in_test",
      },
    ]);
    const exp = await store.createExperiment({
      organizationId,
      locationId: null,
      campaignId: H.campaignId,
      adSetId: H.adSetId,
      hypothesisId: hyp?.id ?? null,
      name: "本部 セラピスト採用｜Hookテスト（研修 vs 社員ストーリー）",
      goal: "recruitment",
      variable: "hook",
      hypothesis: hyp?.hypothesis ?? "",
      primaryMetric: "application_cpa",
      secondaryMetrics: ["ctr", "cvr", "conversions"],
      criteria: DEFAULT_CRITERIA.recruitment,
      status: "running",
      startDate: addDays(today, -33),
      endDate: addDays(today, -13),
      createdBy: actorUserId,
      variants: [variant("control", "A", "H", ""), variant("challenger", "B", "G", "hook: NAORUで働くセラピストの1日")],
    });
    await store.updateExperiment(organizationId, exp.id, { approvedBy: actorUserId, approvedAt: at(35), launchedBy: actorUserId, launchedAt: at(34) });
    await refreshExperiment(store, organizationId, exp.id, now);
    await completeExperiment(deps, exp.id, { pauseLosers: false });
  }

  // 渋谷院: A (control, fatigued) vs B「仕事終わり…」 — running.
  const A = adByKey.get("A");
  const B = adByKey.get("B");
  if (A && B) {
    const [hyp] = await store.addHypotheses([
      {
        organizationId,
        locationId: A.locationId,
        analysisId: null,
        campaignId: A.campaignId,
        adSetId: A.adSetId,
        adId: A.id,
        goal: "acquisition",
        problem: "「その肩こり、揉むだけ…」は配信6週目でCTRが低下",
        hypothesis: "仕事終わりという具体的な時間帯を入れると、30代デスクワーカーが自分ごと化しやすくCTRと予約率が上がる",
        changeVariable: "hook",
        testIdea: "現行A（悩み訴求）をControl、B「仕事終わり、首肩が限界になるあなたへ」をChallengerに",
        expectedResult: "CPA 15%以上改善・CTR改善",
        primaryMetric: "cpa",
        confidence: 0.64,
        status: "in_test",
      },
    ]);
    const exp = await store.createExperiment({
      organizationId,
      locationId: A.locationId,
      campaignId: A.campaignId,
      adSetId: A.adSetId,
      hypothesisId: hyp?.id ?? null,
      name: "渋谷院 新規集客｜Hookテスト（悩み訴求 vs 仕事終わり）",
      goal: "acquisition",
      variable: "hook",
      hypothesis: hyp?.hypothesis ?? "",
      primaryMetric: "cpa",
      secondaryMetrics: ["ctr", "cvr", "conversions"],
      criteria: DEFAULT_CRITERIA.acquisition,
      status: "running",
      startDate: addDays(today, -9),
      endDate: null,
      createdBy: actorUserId,
      variants: [variant("control", "A", "A", ""), variant("challenger", "B", "B", "hook: 仕事終わり、首肩が限界になるあなたへ")],
    });
    await store.updateExperiment(organizationId, exp.id, { approvedBy: actorUserId, approvedAt: at(10), launchedBy: actorUserId, launchedAt: at(10) });
    await refreshExperiment(store, organizationId, exp.id, now);
  }

  await runAdAnalysis({ store, repo, brain, organizationId, actorUserId, locationIds: null });
}
