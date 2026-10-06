/**
 * AI Account Strategist — proposes the operating strategy of ONE social
 * account from the Brand Brain, the location and the account's goal.
 * The output is a proposal; the user applies it explicitly.
 */
import type { AccountGoal, BrandBrainInput, ContentPillar, LocationProfile, SnsAccountInput } from "@/lib/domain/types";
import { goalLabel, PLATFORM_LABELS } from "@/lib/domain/labels";
import { formatScopeContext } from "@/lib/brand/context";
import { FUNNELS, GOAL_PRESETS } from "@/lib/brand/account-goals";
import { SYSTEM_CONTENT_PILLARS } from "@/lib/brand/content-pillars";
import type { GenerateObjectRequest } from "../provider";
import { accountStrategistSchema, type AccountStrategistOutput } from "../schemas";
import { brandSystemBlock, first, SAFETY_RULES } from "./shared";

const GOAL_GUIDANCE: Record<AccountGoal, string> = {
  acquisition: [
    "目的は新規来店・予約の獲得。ファネル: 認知 → 悩み → 教育 → 信頼 → 来店 → 予約。",
    "ターゲットは来店の可能性がある生活者（商圏・勤務地・悩みで具体化）。",
    "KPIは予約に近い行動（プロフィールアクセス・LINE登録・予約数）を主にする。",
    "柱はお悩み共感・教育・セルフケア・Before/After・口コミ・オファーから、来店までの流れが途切れないよう選ぶ。",
  ].join("\n"),
  recruitment: [
    "目的は採用（応募獲得）。お客様ではなく求職者（セラピスト・PT・柔道整復師など）に向けた戦略にする。",
    "ファネル: 認知 → 興味 → 共感 → 職場理解 → キャリア理解 → 応募。",
    "KPIは採用ページクリック・DM・応募数を主にする。集客向けの施術訴求やお客様向けオファーは使わない。",
    "柱はスタッフストーリー・1日の仕事・研修・キャリア・給与/福利厚生・カルチャー・社員の声から選ぶ。",
  ].join("\n"),
  branding: "目的はブランドの世界観と信頼の形成。全店舗を束ねる本部の視点で、一貫性と専門性を重視する。",
  engagement: "目的はフォロワーとの会話・反応の増加。参加型・短尺・高頻度を重視する。",
  retention: "目的は既存顧客の再来店・継続。来店後フォローとセルフケアを中心にする。",
  custom: "目的はユーザーが定義したカスタム目的。目的の文言に忠実に設計する。",
};

export function buildAccountStrategistRequest(
  brain: BrandBrainInput,
  account: Pick<SnsAccountInput, "platform" | "goal" | "customGoal" | "handle" | "strategy">,
  location: LocationProfile | null,
  pillars: ContentPillar[] = SYSTEM_CONTENT_PILLARS,
): GenerateObjectRequest<AccountStrategistOutput> {
  const { ctx, text } = brandSystemBlock(brain);
  const goal = goalLabel(account.goal, account.customGoal);
  const library = pillars.filter((p) => p.goal === account.goal || account.goal === "custom");
  const existing = account.strategy;
  const system = [
    `あなたは「${ctx.brand.name}」のSNSアカウント戦略を設計する AI Account Strategist です。`,
    `対象: ${PLATFORM_LABELS[account.platform]} ${account.handle || "(未設定)"} / 目的: ${goal}`,
    GOAL_GUIDANCE[account.goal],
    "出力ルール:",
    "- recommendedContentPillars は可能な限り下記ライブラリの key を使う（新しい柱は key を空文字にして label だけ書く）。",
    "- monthlyContentMix の sharePercent の合計は100にする。funnelStage は目的のファネル段階名を使う。",
    "- 投稿頻度・曜日・時間は店舗スタッフが無理なく続けられる現実的な値にする（曜日は 0=日〜6=土）。",
    "- risks には炎上・景表法/医療広告・運用負荷などの注意点、suggestions には最初の1ヶ月で試すことを書く。",
    `- ファネル段階: ${FUNNELS[account.goal].join(" → ")}`,
    "コンテンツの柱ライブラリ:",
    ...library.map((p) => `- ${p.key}: ${p.label}（${p.description}）`),
    SAFETY_RULES,
    "",
    text,
    `\n${formatScopeContext({ location })}`,
  ].join("\n");

  const prompt = [
    "このアカウントの運用戦略を提案してください。",
    existing.persona || existing.contentPillars.length
      ? `現在の戦略（改善の参考）: ターゲット=${existing.targetAudience || "未設定"} / ペルソナ=${existing.persona || "未設定"} / 柱=${existing.contentPillars.join("・") || "未設定"} / 週${existing.postsPerWeek}本 / CTA=${existing.cta || "未設定"}`
      : "現在の戦略は未設定です。",
  ].join("\n");

  return {
    system,
    prompt,
    schema: accountStrategistSchema,
    schemaName: "account_strategy",
    maxTokens: 4000,
    mockResponse: () => mockStrategist(brain, account, location, library),
  };
}

function mockStrategist(
  brain: BrandBrainInput,
  account: Pick<SnsAccountInput, "platform" | "goal" | "customGoal" | "handle">,
  location: LocationProfile | null,
  library: ContentPillar[],
): AccountStrategistOutput {
  const { ctx } = brandSystemBlock(brain);
  const preset = GOAL_PRESETS[account.goal].strategy;
  const area = location?.area || location?.locationName || ctx.locations[0]?.name || "";
  const isThreads = account.platform === "threads";
  const pillars = preset.contentPillars
    .map((key) => library.find((p) => p.key === key))
    .filter((p): p is ContentPillar => Boolean(p))
    .slice(0, 5);
  const stages = FUNNELS[account.goal];
  const share = Math.floor(100 / Math.max(1, pillars.length));

  if (account.goal === "recruitment") {
    return {
      goal: "応募獲得（採用ページ・DMへの導線をつくる）",
      targetAudience: `20〜30代の理学療法士・柔道整復師・セラピスト${area ? `（${area}周辺で働ける方）` : ""}`,
      targetPersona: "臨床経験2〜5年。技術を伸ばしたいが、今の職場では教育体制や将来像が見えず転職を考え始めている。",
      primaryKpi: { metric: "応募数", target: 3, unit: "件/月" },
      secondaryKpis: [
        { metric: "採用ページクリック", target: 60, unit: "回/月" },
        { metric: "DM", target: 8, unit: "件/月" },
      ],
      recommendedContentPillars: pillars.map((p) => ({ key: p.key, label: p.label, reason: `${p.description}ことで、求職者の不安を減らす` })),
      recommendedPostsPerWeek: isThreads ? 3 : 2,
      postingFrequencyNote: isThreads ? "テキストで働く人の本音を短く" : "Reel1本・フィード1本",
      recommendedPostingDays: [2, 6],
      recommendedPostingTimes: ["21:00"],
      ctaStrategy: "見学・カジュアル面談はDMで気軽に。詳細は採用ページへ（プロフィールリンク）",
      tone: "等身大で誠実に。スタッフ本人の言葉を中心に、誇張しない",
      monthlyContentMix: pillars.map((p, i) => ({ pillar: p.label, sharePercent: i === 0 ? 100 - share * (pillars.length - 1) : share, funnelStage: stages[Math.min(stages.length - 1, i)]! })),
      risks: ["給与・待遇は事実と異なる表現にならないよう本部で確認する", "スタッフの顔出しは本人の同意を得る"],
      suggestions: ["最初の1ヶ月は「スタッフの1日」Reelを2本作り、反応を見る", "応募前の不安（研修・休日）にFAQ形式で答える"],
    };
  }

  const target = [ctx.targetAudience.ageRange, ctx.targetAudience.gender.split(/[\s/]/)[0], location?.area ? `${location.area}勤務` : ctx.targetAudience.occupation]
    .filter(Boolean)
    .join(" / ");
  const pain = first(ctx.painPoints, "日々の不調");
  return {
    goal: account.goal === "acquisition" ? "新規予約の獲得（LINE・プロフィールから予約へ）" : GOAL_PRESETS[account.goal].description,
    targetAudience: target || "近隣で働く・暮らす生活者",
    targetPersona: `${location?.demographics || ctx.targetAudience.occupation || "近隣のオフィスワーカー"}。「${pain}」が続き、仕事帰りに通える場所を探している。`,
    primaryKpi: account.goal === "acquisition" ? { metric: "予約数", target: 30, unit: "件/月" } : { metric: preset.kpiTargets[0]?.metric ?? "保存数", target: null, unit: preset.kpiTargets[0]?.unit ?? "" },
    secondaryKpis: preset.kpiTargets.slice(account.goal === "acquisition" ? 0 : 1, 3).filter((k) => k.metric !== "予約数"),
    recommendedContentPillars: pillars.map((p) => ({ key: p.key, label: p.label, reason: `${p.description}ことで「${pain}」に悩む人の行動を後押しする` })),
    recommendedPostsPerWeek: isThreads ? 5 : preset.postsPerWeek,
    postingFrequencyNote: isThreads ? "平日のお昼に短いテキストで共感を集める" : preset.postingFrequencyNote,
    recommendedPostingDays: isThreads ? [1, 2, 3, 4, 5] : preset.preferredPostingDays,
    recommendedPostingTimes: isThreads ? ["12:00"] : ["20:00"],
    ctaStrategy: account.goal === "acquisition" ? `LINE予約を主導線に。保存を促す投稿はプロフィールリンクへ${location?.offers[0] ? `（${location.offers[0]}を併記）` : ""}` : preset.cta,
    tone: first(ctx.brand.tone, preset.tone),
    monthlyContentMix: pillars.map((p, i) => ({ pillar: p.label, sharePercent: i === 0 ? 100 - share * (pillars.length - 1) : share, funnelStage: stages[Math.min(stages.length - 1, i)]! })),
    risks: ["Before/Afterや口コミは許諾を得た事実のみ使う", "「治る」など効果の断定表現は避ける"],
    suggestions: [`「${pain}」のセルフケアReelで保存数を伸ばす`, location?.localKeywords[0] ? `ハッシュタグ #${location.localKeywords[0].replace(/^#/, "")} を毎回入れる` : "地域名のハッシュタグを毎回入れる"],
  };
}
