import type { BrandBrainInput, Campaign } from "@/lib/domain/types";
import type { GenerateObjectRequest } from "../provider";
import { adAnalysisSchema, type AdAnalysis } from "../schemas";
import { brandSystemBlock, SAFETY_RULES } from "./shared";

/** Read-only analysis: proposes changes, never applies them. */
export function buildAdAnalysisRequest(
  brain: BrandBrainInput,
  campaigns: Campaign[],
): GenerateObjectRequest<AdAnalysis> {
  const { ctx, text } = brandSystemBlock(brain);
  const table = campaigns
    .map((c) => `- ${c.name}: status=${c.status}, spend=¥${c.spend}, imp=${c.impressions}, ctr=${c.ctr}%, clicks=${c.clicks}, cv=${c.conversions}, roas=${c.roas}x`)
    .join("\n");
  const system = [
    `あなたは「${ctx.brand.name}」の広告アナリストです。キャンペーン実績から、観測→仮説→提案の順で改善点を最大3つ示します。`,
    "提案は人が承認してから実行される前提で書き、数値は与えられたデータのみを根拠にする。",
    SAFETY_RULES,
    "",
    text,
  ].join("\n");
  return {
    system,
    prompt: `キャンペーン実績:\n${table}`,
    schema: adAnalysisSchema,
    schemaName: "ad_analysis",
    maxTokens: 4000,
    mockResponse: () => {
      const sorted = [...campaigns].sort((a, b) => a.ctr - b.ctr);
      const worst = sorted[0];
      const best = [...campaigns].sort((a, b) => b.roas - a.roas)[0];
      return {
        insights: [
          worst
            ? { title: `「${worst.name}」のCTRが低めです`, observation: `CTR ${worst.ctr}%は他キャンペーンより低い水準です。`, hypothesis: "同じクリエイティブの配信が続き、広告疲労が起きている可能性があります。", proposal: "Creative Studioで新しいファーストビューを2案作り、並行テストします。", impact: "medium" as const }
            : { title: "データが不足しています", observation: "分析対象のキャンペーンがありません。", hypothesis: "広告アカウントが未連携です。", proposal: "Meta広告の連携後に再分析してください。", impact: "low" as const },
          ...(best
            ? [{ title: `「${best.name}」が好調です`, observation: `ROAS ${best.roas}xで最も効率的です。`, hypothesis: `${ctx.targetAudience.occupation || "ターゲット"}への訴求が合っている可能性があります。`, proposal: "低調な広告の予算を段階的に配分する案を、承認待ちとして作成します。", impact: "high" as const }]
            : []),
        ],
      };
    },
  };
}
