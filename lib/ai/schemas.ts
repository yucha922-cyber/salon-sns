/** AI output schemas. Every structured AI response is validated against these. */
import { z } from "zod";

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
