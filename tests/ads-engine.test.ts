import { describe, expect, it } from "vitest";
import { MockAdsProvider, mockToday } from "@/lib/ads/mock";
import { MOCK_ADS, MOCK_CAMPAIGNS } from "@/lib/ads/mock/data";
import { addDays } from "@/lib/ads/metrics";
import { diagnose, type DiagnosisEntity } from "@/lib/ads/diagnosis";
import type { AdMetricSnapshot } from "@/lib/ads/types";
import { derive } from "@/lib/ads/metrics";

async function demoSnapshots() {
  const p = new MockAdsProvider();
  const until = addDays(mockToday(), -1);
  const since = addDays(until, -29);
  const ctx = { accessToken: "x", accountExternalId: "act_1" };
  const snaps: AdMetricSnapshot[] = [];
  for (const level of ["ad", "campaign", "account"] as const) {
    for (const r of await p.syncInsights(ctx, { level, since, until, conversionActionTypes: () => [] })) {
      snaps.push({ ...r.metrics, ...derive(r.metrics), id: `${level}:${r.externalId}:${r.date}`, organizationId: "o", adAccountId: null, locationId: null, entityType: level, entityId: r.externalId, date: r.date, dateStop: r.dateStop, rawMetrics: r.raw, source: "mock", capturedAt: "" });
    }
  }
  return { snaps, until };
}

describe("ads diagnosis on the demo account", () => {
  it("finds fatigue on A, LP problem on E, winner D, underdelivery on Yokohama", async () => {
    const { snaps, until } = await demoSnapshots();
    const entities: DiagnosisEntity[] = [
      ...MOCK_ADS.map((a) => ({ entityType: "ad" as const, id: a.externalId, name: a.name, campaignId: a.campaignExternalId, adSetId: a.adSetExternalId, locationId: null, goal: a.campaignExternalId === "120000000000104" ? ("recruitment" as const) : ("acquisition" as const), angle: a.angle, startedAt: `${addDays(until, -a.startedDaysAgo + 1)}T00:00:00Z`, active: a.pausedDaysAgo === null })),
      ...MOCK_CAMPAIGNS.map((c) => ({ entityType: "campaign" as const, id: c.externalId, name: c.name, campaignId: c.externalId, adSetId: null, locationId: null, goal: c.key === "recruit" ? ("recruitment" as const) : ("acquisition" as const), dailyBudget: c.dailyBudget, active: true })),
    ];
    const f = diagnose({ end: until, entities, snapshots: snaps });
    const kinds = f.map((x) => `${x.kind}:${x.entityName.slice(0, 1)}`);
    expect(kinds).toContain("creative_fatigue:A");
    expect(kinds).toContain("lp_cvr_drop:E");
    expect(kinds).toContain("winning_creative:D");
    expect(kinds.some((k) => k.startsWith("underdelivery:横"))).toBe(true);
  });
});
