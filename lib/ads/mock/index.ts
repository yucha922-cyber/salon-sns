import "server-only";
import { randomToken, signPayload, verifyPayload } from "@/lib/social/crypto";
import { SocialApiError } from "@/lib/social/errors";
import { jstDateKey } from "@/lib/domain/dates";
import { addDays } from "../metrics";
import type { AdsContext, AdsProvider, CreativeDraftInput, ProviderAd, ProviderAdSet, ProviderCampaign, ProviderCreative, ProviderInsightRow } from "../provider";
import type { AdDailyMetrics } from "../types";
import { MOCK_ACCOUNT, MOCK_AD_SETS, MOCK_ADS, MOCK_CAMPAIGNS, mockAdDay, type MockAdDef } from "./data";

/**
 * MockAdsProvider — Demo Mode / demo organizations / tests. Never calls Meta.
 * Ads created through experiments are remembered per server instance and
 * deliver deterministic metrics from the day after they are activated.
 */
interface CreatedAd {
  def: MockAdDef;
  createdAt: string; // YYYY-MM-DD (JST)
  status: "PAUSED" | "ACTIVE";
  activatedAt: string | null;
}
const g = globalThis as unknown as { __naoruMockAds?: { creatives: Map<string, CreativeDraftInput>; ads: Map<string, CreatedAd>; status: Map<string, "PAUSED" | "ACTIVE"> } };
const state = (g.__naoruMockAds ??= { creatives: new Map(), ads: new Map(), status: new Map() });

/** "today" in the account timezone; the last complete day is yesterday. */
export function mockToday(now: Date = new Date()): string {
  return jstDateKey(now);
}

const STRONG_HOOK = /仕事終わり|夕方|残業|帰宅|PC作業|昼休み|8時間|定時/;

function allAds(): (MockAdDef & { createdAt?: string; activatedAt?: string | null })[] {
  return [
    ...MOCK_ADS,
    ...[...state.ads.values()].map((a) => ({ ...a.def, createdAt: a.createdAt, activatedAt: a.activatedAt })),
  ];
}

function adStatus(ad: MockAdDef): "PAUSED" | "ACTIVE" {
  return state.status.get(ad.externalId) ?? (ad.pausedDaysAgo !== null ? "PAUSED" : "ACTIVE");
}

function dayMetrics(ad: ReturnType<typeof allAds>[number], date: string, today: string): AdDailyMetrics | null {
  const daysAgo = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  if (daysAgo < 1) return null; // today is incomplete
  let age: number;
  if (ad.createdAt) {
    if (!ad.activatedAt || date <= ad.activatedAt) return null;
    age = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${ad.activatedAt}T00:00:00Z`)) / 86_400_000);
  } else {
    age = ad.startedDaysAgo - daysAgo;
    if (age < 0) return null;
    if (ad.pausedDaysAgo !== null && daysAgo < ad.pausedDaysAgo) return null;
    if (state.status.get(ad.externalId) === "PAUSED") return null;
  }
  const m = mockAdDay(ad, age, daysAgo);
  if (ad.format === "video") {
    m.video3sViews = Math.round(m.impressions * 0.31);
    m.thruplays = Math.round(m.impressions * 0.075);
  }
  return m;
}

function sumRows(rows: AdDailyMetrics[]): AdDailyMetrics {
  const impr = rows.reduce((n, r) => n + r.impressions, 0);
  const freqImpr = rows.reduce((n, r) => n + (r.frequency ?? 0) * r.impressions, 0);
  const s = (k: keyof AdDailyMetrics) => {
    const vals = rows.map((r) => r[k]).filter((v): v is number => typeof v === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  return {
    spend: s("spend") ?? 0,
    impressions: impr,
    reach: s("reach"),
    frequency: impr ? Math.round((freqImpr / impr) * 100) / 100 : null,
    clicks: s("clicks") ?? 0,
    landingPageViews: s("landingPageViews"),
    conversions: s("conversions") ?? 0,
    revenue: s("revenue"),
    video3sViews: s("video3sViews"),
    thruplays: s("thruplays"),
  };
}

export class MockAdsProvider implements AdsProvider {
  readonly kind = "mock" as const;

  constructor(private readonly now: () => Date = () => new Date()) {}

  getAuthorizationUrl({ state: oauthState, redirectUri }: { state: string; redirectUri: string }): string {
    return `/ads/mock-authorize?${new URLSearchParams({ state: oauthState, redirect_uri: redirectUri }).toString()}`;
  }

  static createCode(): string {
    return signPayload({ kind: "mock-ads" }, 600);
  }

  async connect({ code }: { code: string; redirectUri: string }) {
    if (!verifyPayload<{ kind: string }>(code)) throw new SocialApiError("permission", "mock ads: invalid code");
    return {
      accessToken: `mock_ads_${randomToken(16)}`,
      expiresAt: new Date(this.now().getTime() + 60 * 86_400_000).toISOString(),
      scopes: ["ads_read", "ads_management", "business_management"],
      accounts: [MOCK_ACCOUNT, { ...MOCK_ACCOUNT, externalAccountId: "act_120000000000002", name: "NAORU 採用広告（テスト用）" }],
    };
  }

  async syncCampaigns(): Promise<ProviderCampaign[]> {
    const today = mockToday(this.now());
    return MOCK_CAMPAIGNS.map((c) => ({
      externalId: c.externalId,
      name: c.name,
      objective: c.objective,
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      dailyBudget: c.dailyBudget,
      lifetimeBudget: null,
      specialAdCategories: c.specialAdCategories,
      startTime: `${addDays(today, -45)}T00:00:00+0900`,
      stopTime: null,
      raw: { conversion_event: c.conversionEvent, landing_page_url: c.landingPageUrl, mock: true },
    }));
  }

  async syncAdSets(): Promise<ProviderAdSet[]> {
    return MOCK_AD_SETS.map((s) => {
      const c = MOCK_CAMPAIGNS.find((x) => x.externalId === s.campaignExternalId);
      return {
        externalId: s.externalId,
        campaignExternalId: s.campaignExternalId,
        name: s.name,
        status: "ACTIVE",
        effectiveStatus: "ACTIVE",
        optimizationGoal: "OFFSITE_CONVERSIONS",
        billingEvent: "IMPRESSIONS",
        dailyBudget: null,
        targeting: { audience_label: s.audienceLabel, geo_locations: { countries: ["JP"] } },
        promotedObject: { pixel_id: "900000000000001", custom_event_type: c?.conversionEvent === "SubmitApplication" ? "SUBMIT_APPLICATION" : "SCHEDULE" },
      };
    });
  }

  async syncAds(): Promise<ProviderAd[]> {
    const today = mockToday(this.now());
    return allAds().map((a) => {
      const status = adStatus(a);
      return {
        externalId: a.externalId,
        adSetExternalId: a.adSetExternalId,
        campaignExternalId: a.campaignExternalId,
        creativeExternalId: a.creativeExternalId,
        name: a.name,
        status,
        effectiveStatus: status,
        createdTime: a.createdAt ? `${a.createdAt}T09:00:00+0900` : `${addDays(today, -a.startedDaysAgo)}T09:00:00+0900`,
        landingPageUrl: MOCK_CAMPAIGNS.find((c) => c.externalId === a.campaignExternalId)?.landingPageUrl ?? null,
        reviewFeedback: null,
      };
    });
  }

  async syncCreatives(): Promise<ProviderCreative[]> {
    return allAds().map((a) => ({
      externalId: a.creativeExternalId,
      name: a.name,
      title: a.headline,
      body: a.body,
      callToActionType: a.cta,
      linkUrl: MOCK_CAMPAIGNS.find((c) => c.externalId === a.campaignExternalId)?.landingPageUrl ?? null,
      thumbnailUrl: "/demo/sample-post.jpg",
      format: a.format,
    }));
  }

  async syncInsights(_ctx: AdsContext, params: Parameters<AdsProvider["syncInsights"]>[1]): Promise<ProviderInsightRow[]> {
    const today = mockToday(this.now());
    const rows: ProviderInsightRow[] = [];
    const ads = allAds();
    for (let date = params.since; date <= params.until; date = addDays(date, 1)) {
      const perAd = ads.map((a) => ({ a, m: dayMetrics(a, date, today) })).filter((x): x is { a: (typeof ads)[number]; m: AdDailyMetrics } => x.m !== null);
      const push = (externalId: string, list: AdDailyMetrics[]) => {
        if (!list.length) return;
        const m = list.length === 1 ? (list[0] as AdDailyMetrics) : sumRows(list);
        rows.push({ level: params.level, externalId, date, dateStop: date, metrics: m, raw: { schedule_total: m.conversions, landing_page_view: m.landingPageViews ?? 0, link_click: m.clicks } });
      };
      if (params.level === "ad") for (const { a, m } of perAd) push(a.externalId, [m]);
      if (params.level === "adset") for (const s of MOCK_AD_SETS) push(s.externalId, perAd.filter((x) => x.a.adSetExternalId === s.externalId).map((x) => x.m));
      if (params.level === "campaign") for (const c of MOCK_CAMPAIGNS) push(c.externalId, perAd.filter((x) => x.a.campaignExternalId === c.externalId).map((x) => x.m));
      if (params.level === "account") push(MOCK_ACCOUNT.externalAccountId, perAd.map((x) => x.m));
    }
    return rows;
  }

  async createCreativeDraft(_ctx: AdsContext, input: CreativeDraftInput): Promise<{ externalId: string }> {
    const externalId = `mockcr_${randomToken(8)}`;
    state.creatives.set(externalId, input);
    return { externalId };
  }

  async createAdDraft(_ctx: AdsContext, input: { adSetExternalId: string; creativeExternalId: string; name: string; status: "PAUSED" | "ACTIVE" }) {
    const creative = state.creatives.get(input.creativeExternalId);
    const adSet = MOCK_AD_SETS.find((s) => s.externalId === input.adSetExternalId);
    if (!adSet) throw new SocialApiError("invalid_content", "mock ads: ad set not found");
    const externalId = `mockad_${randomToken(8)}`;
    const text = `${creative?.headline ?? ""} ${creative?.primaryText ?? ""}`;
    const today = mockToday(this.now());
    state.ads.set(externalId, {
      def: {
        key: externalId,
        externalId,
        creativeExternalId: input.creativeExternalId,
        adSetExternalId: input.adSetExternalId,
        campaignExternalId: adSet.campaignExternalId,
        name: input.name,
        headline: creative?.headline ?? input.name,
        body: creative?.primaryText ?? "",
        cta: creative?.callToActionType ?? "LEARN_MORE",
        angle: "",
        hook: creative?.headline ?? "",
        format: "image",
        startedDaysAgo: 0,
        pausedDaysAgo: null,
        profile: STRONG_HOOK.test(text) ? "challenger" : "steady",
      },
      createdAt: today,
      status: input.status,
      activatedAt: input.status === "ACTIVE" ? today : null,
    });
    state.status.set(externalId, input.status);
    return { externalId };
  }

  async createExperiment(ctx: AdsContext, input: { adSetExternalId: string; variants: { label: string; creativeExternalId: string; name: string }[]; start: boolean }) {
    const out: { label: string; externalAdId: string }[] = [];
    for (const v of input.variants) {
      const ad = await this.createAdDraft(ctx, { adSetExternalId: input.adSetExternalId, creativeExternalId: v.creativeExternalId, name: v.name, status: input.start ? "ACTIVE" : "PAUSED" });
      out.push({ label: v.label, externalAdId: ad.externalId });
    }
    return out;
  }

  async pauseAd(_ctx: AdsContext, adExternalId: string): Promise<void> {
    state.status.set(adExternalId, "PAUSED");
  }

  async activateAd(_ctx: AdsContext, adExternalId: string): Promise<void> {
    state.status.set(adExternalId, "ACTIVE");
    const created = state.ads.get(adExternalId);
    if (created && !created.activatedAt) created.activatedAt = mockToday(this.now());
  }

  async getPreview(): Promise<{ html: string | null }> {
    return { html: null };
  }
}
