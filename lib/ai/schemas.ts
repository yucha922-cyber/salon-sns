/** AI output schemas. Every structured AI response is validated against these. */
import { z } from "zod";
import { CONTENT_TYPES } from "@/lib/domain/types";

export const postDraftSchema = z.object({
  title: z.string().min(1).max(200),
  caption: z.string().min(1).max(2200),
  cta: z.string().max(200),
  hashtags: z.array(z.string().max(60)).max(30),
});
export type PostDraft = z.infer<typeof postDraftSchema>;

export const creativeConceptsSchema = z.object({
  concepts: z
    .array(
      z.object({
        angle: z.string().max(60),
        headline: z.string().max(120),
        body: z.string().max(400),
        visualHook: z.string().max(120),
        rationale: z.string().max(300),
      }),
    )
    .min(1)
    .max(6),
});
export type CreativeConcepts = z.infer<typeof creativeConceptsSchema>;

export const adAnalysisSchema = z.object({
  insights: z
    .array(
      z.object({
        title: z.string().max(120),
        observation: z.string().max(400),
        hypothesis: z.string().max(400),
        proposal: z.string().max(400),
        impact: z.enum(["low", "medium", "high"]),
      }),
    )
    .min(1)
    .max(5),
});
export type AdAnalysis = z.infer<typeof adAnalysisSchema>;

const kpiSchema = z.object({ metric: z.string().max(80), target: z.number().nullable(), unit: z.string().max(20) });

/** AI Account Strategist output. */
export const accountStrategistSchema = z.object({
  goal: z.string().max(200),
  targetAudience: z.string().max(300),
  targetPersona: z.string().max(500),
  primaryKpi: kpiSchema,
  secondaryKpis: z.array(kpiSchema).max(4),
  recommendedContentPillars: z.array(z.object({ key: z.string().max(64), label: z.string().max(60), reason: z.string().max(200) })).min(2).max(6),
  recommendedPostsPerWeek: z.number().int().min(1).max(21),
  postingFrequencyNote: z.string().max(200),
  recommendedPostingDays: z.array(z.number().int().min(0).max(6)).max(7),
  recommendedPostingTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(4),
  ctaStrategy: z.string().max(300),
  tone: z.string().max(300),
  monthlyContentMix: z.array(z.object({ pillar: z.string().max(60), sharePercent: z.number().int().min(0).max(100), funnelStage: z.string().max(30) })).min(2).max(8),
  risks: z.array(z.string().max(200)).max(5),
  suggestions: z.array(z.string().max(200)).max(5),
});
export type AccountStrategistOutput = z.infer<typeof accountStrategistSchema>;

const planContentSchema = z.object({
  slot: z.number().int().min(0),
  contentType: z.enum(CONTENT_TYPES),
  theme: z.string().min(1).max(120),
  hook: z.string().max(200),
  summary: z.string().max(400),
  target: z.string().max(200),
  contentPillar: z.string().max(60),
  cta: z.string().max(200),
});
export type PlanContent = z.infer<typeof planContentSchema>;

/** AI monthly plan: content for pre-computed posting slots. */
export const monthlyPlanSchema = z.object({
  summary: z.string().max(600),
  items: z.array(planContentSchema).min(1).max(60),
});
export type MonthlyPlanOutput = z.infer<typeof monthlyPlanSchema>;

export const planItemRegenerationSchema = z.object({ item: planContentSchema });

/** AI operations review → recommendations for humans to approve. */
export const operationsReviewSchema = z.object({
  recommendations: z
    .array(
      z.object({
        accountHandle: z.string().max(80).nullable(),
        category: z.enum(["social", "ads", "creative", "strategy", "recruitment", "acquisition"]),
        severity: z.enum(["low", "medium", "high"]),
        title: z.string().max(120),
        observation: z.string().max(400),
        insight: z.string().max(400),
        hypothesis: z.string().max(400),
        recommendedAction: z.string().max(400),
        expectedImpact: z.string().max(200),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(8),
});
export type OperationsReviewOutput = z.infer<typeof operationsReviewSchema>;
