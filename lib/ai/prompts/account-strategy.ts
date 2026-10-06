import type { AccountGoal, BrandBrainInput, LocationProfile, SocialPlatform } from "@/lib/domain/types";
import { ACCOUNT_GOAL_LABELS, PLATFORM_LABELS } from "@/lib/domain/labels";
import { formatScopeContext } from "@/lib/brand/context";
import { GOAL_PRESETS } from "@/lib/brand/account-goals";
import type { GenerateObjectRequest } from "../provider";
import { accountStrategySuggestionSchema, type AccountStrategySuggestion } from "../schemas";
import { brandSystemBlock, first, SAFETY_RULES } from "./shared";

/** Proposes an account strategy (persona, KPI, pillars, frequency, CTA, tone) for one SNS account. */
export function buildAccountStrategyRequest(
  brain: BrandBrainInput,
  account: { platform: SocialPlatform; goal: AccountGoal; handle: string },
  location: LocationProfile | null,
): GenerateObjectRequest<AccountStrategySuggestion> {
  const { ctx, text } = brandSystemBlock(brain);
  const goal = ACCOUNT_GOAL_LABELS[account.goal];
  const scopeText = formatScopeContext({ location });
  const system = [
    `あなたは「${ctx.brand.name}」のSNS戦略プランナーです。${PLATFORM_LABELS[account.platform]}アカウント（目的: ${goal}）の運用戦略を設計します。`,
    "- persona: このアカウントで狙う具体的な人物像（1〜2文）",
    "- kpis: 目的に直結する測定可能な指標（3〜5個）",
    "- contentPillars: 継続できるコンテンツの柱（3〜5個）",
    "- postsPerWeek / postingFrequencyNote: 店舗の運用負荷を考えた現実的な頻度と内訳",
    "- cta / tone: 目的とブランドに合う行動喚起と文体",
    account.goal === "recruitment" ? "- 採用目的では、お客様ではなく求職者（セラピスト・スタッフ候補）をペルソナにする。" : "",
    SAFETY_RULES,
    "",
    text,
    scopeText ? `\n${scopeText}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    system,
    prompt: `アカウント ${account.handle || "(未設定)"} の運用戦略を提案してください。`,
    schema: accountStrategySuggestionSchema,
    schemaName: "account_strategy",
    maxTokens: 3000,
    mockResponse: () => {
      const preset = GOAL_PRESETS[account.goal].strategy;
      const area = location?.area || ctx.locations[0]?.name || "";
      const persona =
        account.goal === "recruitment"
          ? `${area ? `${area}で` : ""}働く場所を探している20〜30代のセラピスト。技術を伸ばしつつ、無理なく長く働ける職場を求めている。`
          : account.goal === "branding"
            ? `${ctx.brand.name}の考え方に共感する${ctx.targetAudience.ageRange || "幅広い年代"}の方。比較検討の段階でブランドの信頼性を確かめたい。`
            : `${area ? `${area}周辺の` : ""}${[ctx.targetAudience.ageRange, ctx.targetAudience.occupation].filter(Boolean).join("・") || "近隣の生活者"}。「${first(ctx.painPoints, "日々の不調")}」を何とかしたいと感じている。`;
      return {
        persona,
        kpis: [...preset.kpis],
        contentPillars: account.goal === "acquisition" && ctx.painPoints.length
          ? [`${first(ctx.painPoints, "")}のセルフケア`, ...preset.contentPillars.slice(1)]
          : [...preset.contentPillars],
        postsPerWeek: preset.postsPerWeek,
        postingFrequencyNote: preset.postingFrequencyNote,
        cta: preset.cta,
        tone: account.goal === "recruitment" ? preset.tone : first(ctx.brand.tone, preset.tone),
      };
    },
  };
}
