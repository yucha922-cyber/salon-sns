import { describe, expect, it } from "vitest";
import { brandBrainCompleteness, buildBrandContext, formatBrandContext } from "@/lib/brand/context";
import { emptyBrandBrainInput } from "@/lib/brand/defaults";
import { DEMO_BRAND_BRAIN } from "@/lib/demo/seed";
import { brandBrainInputSchema } from "@/lib/domain/schemas";

describe("buildBrandContext", () => {
  it("structures every Brand Brain section for the AI", () => {
    const ctx = buildBrandContext(DEMO_BRAND_BRAIN);
    expect(ctx.brand.name).toBe("NAORU整体 渋谷院");
    expect(ctx.industry.guidance).toContain("断定");
    expect(ctx.painPoints).toContain("肩こり");
    expect(ctx.services).toHaveLength(3);

    const text = formatBrandContext(ctx);
    for (const heading of ["Business", "Brand", "Industry", "Locations", "Services", "Target Audience", "Personas", "Pain Points", "Brand Tone", "Marketing Goals"]) {
      expect(text).toContain(`## ${heading}`);
    }
    expect(text).toContain("¥8,800");
  });

  it("supports custom industries without presets", () => {
    const ctx = buildBrandContext({ ...emptyBrandBrainInput(), industry: { key: "custom", label: "ヨガスタジオ" } });
    expect(ctx.industry.label).toBe("ヨガスタジオ");
    expect(ctx.industry.guidance).toBeNull();
    expect(formatBrandContext(ctx)).toContain("未設定");
  });

  it("scores completeness", () => {
    expect(brandBrainCompleteness(DEMO_BRAND_BRAIN).score).toBe(100);
    expect(brandBrainCompleteness(emptyBrandBrainInput()).missing.length).toBeGreaterThan(5);
  });
});

describe("brandBrainInputSchema", () => {
  it("accepts the demo brain", () => {
    expect(brandBrainInputSchema.safeParse(DEMO_BRAND_BRAIN).success).toBe(true);
  });

  it("rejects malformed input", () => {
    const bad = { ...DEMO_BRAND_BRAIN, industry: { key: "Robert'); DROP TABLE", label: "x" } };
    expect(brandBrainInputSchema.safeParse(bad).success).toBe(false);
    const tooLong = { ...DEMO_BRAND_BRAIN, businessDescription: "a".repeat(5000) };
    expect(brandBrainInputSchema.safeParse(tooLong).success).toBe(false);
  });

  it("drops empty tags", () => {
    const parsed = brandBrainInputSchema.parse({ ...DEMO_BRAND_BRAIN, strengths: ["  ", "強み"] });
    expect(parsed.strengths).toEqual(["強み"]);
  });
});
