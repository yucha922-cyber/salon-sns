import type { BrandBrainInput } from "@/lib/domain/types";
import type { CreativeGenInput, GeneratedCreativeSet } from "@/lib/ads/creative-gen";
import { mockCreativeSet } from "@/lib/ads/creative-gen";
import { ANGLE_LABELS, VARIABLE_LABELS } from "@/lib/ads/creative-memory";
import type { AdFinding } from "@/lib/ads/types";
import type { GenerateObjectRequest } from "../provider";
import { adNarrativeSchema, creativeSetSchema, type AdNarrative, type CreativeSetOutput } from "../schemas";
import { brandSystemBlock, quoteUserInput, SAFETY_RULES } from "./shared";

const AD_RULES = [
  "- あなたは提案するだけ。予算・ターゲティング・配信の停止/開始は人が判断する（実行したとは絶対に書かない）。",
  "- 数値は与えられたものだけを使う。単一の数値で断定せず、過去平均・同じ広告セット・同じ目的との比較で語る。",
  "- 1つのテストで変える変数は1つだけ。",
].join("\n");

/** AI explains / prioritizes the rule-based findings (the numbers come from the engine, not the model). */
export function buildAdNarrativeRequest(brain: BrandBrainInput, findings: AdFinding[], period: { start: string; end: string }): GenerateObjectRequest<AdNarrative> {
  const { ctx, text } = brandSystemBlock(brain);
  const system = [
    `あなたは「${ctx.brand.name}」のMeta広告運用アナリストです。広告担当者が毎朝行う「数字を見て、どこが問題で、次に何を試すか」を代行します。`,
    "与えられたfindings（ルールエンジンが検出した事実）を、担当者が5秒で理解できる日本語に要約し、優先順位の理由を説明します。",
    "summary: 全体で今いちばん重要なこと（3〜4文）。items: findingごとに explanation（なぜ問題/機会か）, testIdea（次のCreativeテスト案。LPなどCreative以外が原因なら確認事項）, expectedResult。",
    AD_RULES,
    SAFETY_RULES,
    "",
    text,
  ].join("\n");
  const prompt = [
    `期間: ${period.start}〜${period.end}`,
    "findings(JSON):",
    JSON.stringify(
      findings.map((f) => ({ id: f.id, kind: f.kind, entity: f.entityName, goal: f.goal, stage: f.stage, observation: f.observation, possibleCause: f.possibleCause, hypothesis: f.hypothesis, variable: f.suggestedVariable, priority: f.priority })),
    ),
  ].join("\n");
  return {
    system,
    prompt,
    schema: adNarrativeSchema,
    schemaName: "ad_narrative",
    maxTokens: 3000,
    mockResponse: () => {
      const problems = findings.filter((f) => f.type === "problem");
      const top = problems[0] ?? findings[0];
      const summary = top
        ? `最優先は「${top.entityName}」の${top.problem}です。${top.observation} ${problems.length > 1 ? `ほかに${problems.length - 1}件の注意点があります。` : ""}${findings.some((f) => f.type === "opportunity") ? "勝ちCreativeの原則を他キャンペーンへ展開する機会もあります。" : ""}`
        : "大きな問題は検出されませんでした。勝ちパターンの横展開と、次のHookテストを計画しましょう。";
      return {
        summary,
        items: findings.map((f) => ({
          findingId: f.id,
          explanation: `${f.observation} ${f.possibleCause}`.slice(0, 480),
          testIdea:
            f.suggestedVariable === "landing_page"
              ? "Creativeは変えずに、LPのファーストビュー・予約導線・表示速度を確認してください（LP改善後に再計測）。"
              : f.suggestedVariable
                ? `現行Creativeを Control（A）として残し、${VARIABLE_LABELS[f.suggestedVariable]}だけを変えた B / C を同じ広告セットで比較します。`
                : f.recommendedAction,
          expectedResult: f.expectedImpact,
        })),
      };
    },
  };
}

/** Creative Brief → challengers B / C for a hypothesis (control A = current ad). */
export function buildCreativeSetRequest(brain: BrandBrainInput, input: CreativeGenInput, memoryText: string): GenerateObjectRequest<CreativeSetOutput> {
  const { ctx, text } = brandSystemBlock(brain);
  const system = [
    `あなたは「${ctx.brand.name}」のパフォーマンス広告のクリエイティブディレクターです。`,
    "仮説を検証するためのCreative Brief と、Challenger B / C の2案を作ります（A は現行広告＝Control）。",
    `今回変える変数は「${VARIABLE_LABELS[input.variable]}」だけ。それ以外（オファー・CTA・LP・ビジュアル方針など）はControlと揃える。`,
    `B は ${ANGLE_LABELS[input.angles[0]]}、C は ${ANGLE_LABELS[input.angles[1]]} の切り口で。`,
    "Creative Memoryの勝ちパターンは『原則』として使い、同じ言い回しは使わない（例: 「仕事終わり」が勝った→「PC作業8時間後」「定時後の30分」など新しい場面で表現）。",
    "既存Hookと似た案（言い回しの焼き直し）は禁止。",
    "Metaポリシー: 「その肩こり」「○○に悩むあなたへ」のように見る人の健康状態・属性を断定/示唆しない。治る・治療・完治・必ず等の断定、実在しない口コミや数値は禁止。採用広告では性別・年齢を限定しない。",
    "各案: hook, headline(40字以内目安), primaryText(125字目安), cta(Metaのcall_to_action type), firstViewCopy, visualDirection, videoScript(0-15秒・4シーン), rationale。",
    AD_RULES,
    SAFETY_RULES,
    "",
    text,
    memoryText ? `\n${memoryText}` : "",
  ].join("\n");
  const prompt = [
    quoteUserInput("location", input.locationName),
    quoteUserInput("goal", input.goal),
    quoteUserInput("persona", input.persona),
    quoteUserInput("pain_point", input.painPoint),
    quoteUserInput("problem", input.problem),
    quoteUserInput("hypothesis", input.hypothesis),
    quoteUserInput("control_headline", input.control.headline),
    quoteUserInput("control_primary_text", input.control.primaryText),
    quoteUserInput("control_cta", input.control.cta),
    quoteUserInput("existing_hooks", input.avoidHooks.join(" / ")),
    quoteUserInput("offer", input.offer),
  ].join("\n");
  return {
    system,
    prompt,
    schema: creativeSetSchema,
    schemaName: "creative_set",
    maxTokens: 4000,
    mockResponse: () => mockCreativeSet(input) as unknown as CreativeSetOutput,
  };
}

export function toGeneratedSet(out: CreativeSetOutput, fallbackAngles: CreativeGenInput["angles"]): GeneratedCreativeSet {
  const angleOf = (a: string, i: number) => ((Object.keys(ANGLE_LABELS) as string[]).includes(a) ? a : fallbackAngles[i]) as CreativeGenInput["angles"][number];
  return {
    brief: { ...out.brief, angle: angleOf(out.brief.angle, 0) },
    variants: out.variants.map((v, i) => ({ ...v, angle: angleOf(v.angle, i) })),
  };
}
