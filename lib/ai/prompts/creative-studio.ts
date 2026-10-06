import type { BrandBrainInput } from "@/lib/domain/types";
import type { GenerateObjectRequest } from "../provider";
import { creativeConceptsSchema, type CreativeConcepts } from "../schemas";
import { brandSystemBlock, first, quoteUserInput, SAFETY_RULES } from "./shared";

export interface CreativeBrief {
  objective: string;
  service: string;
  target: string;
  message: string;
  placement: string;
}

export function buildCreativeStudioRequest(
  brain: BrandBrainInput,
  brief: CreativeBrief,
): GenerateObjectRequest<CreativeConcepts> {
  const { ctx, text } = brandSystemBlock(brain);
  const system = [
    `あなたは「${ctx.brand.name}」の広告クリエイティブディレクターです。`,
    "4つの異なる切り口（悩み訴求 / Before / After / 専門性 / 口コミ）で広告コンセプトを提案します。",
    "各コンセプト: angle（切り口名）, headline（30文字以内）, body（120文字以内）, visualHook（ビジュアルの指示）, rationale（Brand Brainのどの情報に基づくか）。",
    "口コミ風の切り口でも、実在しない口コミを事実として書かない。",
    SAFETY_RULES,
    "",
    text,
  ].join("\n");
  const prompt = [
    quoteUserInput("objective", brief.objective),
    quoteUserInput("service", brief.service),
    quoteUserInput("target", brief.target),
    quoteUserInput("message", brief.message),
    quoteUserInput("placement", brief.placement),
  ].join("\n");

  return {
    system,
    prompt,
    schema: creativeConceptsSchema,
    schemaName: "creative_concepts",
    maxTokens: 4000,
    mockResponse: () => {
      const pain = first(ctx.painPoints, "毎日の悩み");
      const strength = first(ctx.strengths, "こだわりのサービス");
      const location = ctx.locations[0]?.name ?? ctx.brand.name;
      return {
        concepts: [
          { angle: "悩み訴求", headline: `その${pain}、あきらめていませんか？`, body: `${brief.target}に多い「${pain}」。原因から見直す${brief.service}で、毎日を軽やかに。`, visualHook: "夕方のオフィスで肩に手を当てる人物", rationale: "Brand Brainの主な悩みとターゲットに基づく" },
          { angle: "Before / After", headline: "鏡の前で、変化に気づく。", body: `${brief.service}の流れを短く見せ、来店後のイメージを具体的に伝えます。`, visualHook: "施術前後の姿勢を並べたシルエット比較（誇張なし）", rationale: "サービス内容と体験価値に基づく" },
          { angle: "専門性", headline: `${strength}で、あなたに合わせて。`, body: `${location}の「${strength}」を前面に。初めての方の不安を減らします。`, visualHook: "清潔感のある個室とスタッフのカウンセリング風景", rationale: "強み・差別化ポイントに基づく" },
          { angle: "口コミ", headline: "仕事帰りに寄れるから、続けられる。", body: `${brief.target}の日常に寄り添うストーリー。実際の声は許諾を得たものだけを使用します。`, visualHook: "仕事帰りに店舗へ向かう後ろ姿", rationale: "ペルソナと利用シーンに基づく" },
        ],
      };
    },
  };
}
