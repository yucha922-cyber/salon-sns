import { describe, expect, it } from "vitest";
import { computePostingSlots, jstSlotToIso } from "@/lib/planning/slots";

describe("computePostingSlots", () => {
  it("respects posts per week and preferred days", () => {
    // November 2026: 30 days, starts on Sunday
    const slots = computePostingSlots({ year: 2026, month: 11, postsPerWeek: 4, preferredDays: [1, 3, 5, 0], preferredTimes: ["20:00"], platform: "instagram", goal: "acquisition" });
    expect(slots.length).toBeGreaterThanOrEqual(16);
    expect(slots.length).toBeLessThanOrEqual(18);
    expect(slots.every((s) => [0, 1, 3, 5].includes(s.weekday))).toBe(true);
    expect(slots.every((s) => s.time === "20:00")).toBe(true);
    expect(slots[0]?.funnelStage).toBe("認知");
    expect(slots.at(-1)?.funnelStage).toBe("予約");
  });

  it("uses the recruitment funnel and fewer posts", () => {
    const slots = computePostingSlots({ year: 2026, month: 11, postsPerWeek: 2, preferredDays: [], preferredTimes: [], platform: "instagram", goal: "recruitment" });
    expect(slots.length).toBeGreaterThanOrEqual(8);
    expect(slots.length).toBeLessThanOrEqual(10);
    expect(slots.at(-1)?.funnelStage).toBe("応募");
  });

  it("starts after earliestDate and supports >7 posts per week", () => {
    const slots = computePostingSlots({ year: 2026, month: 10, postsPerWeek: 10, preferredDays: [], preferredTimes: ["12:00", "21:00"], platform: "threads", goal: "engagement", earliestDate: "2026-10-20" });
    expect(slots.every((s) => s.date >= "2026-10-20")).toBe(true);
    expect(new Set(slots.map((s) => s.date + s.time)).size).toBe(slots.length);
  });

  it("converts JST slots to ISO", () => {
    expect(jstSlotToIso("2026-11-02", "20:00")).toBe("2026-11-02T11:00:00.000Z");
  });
});
