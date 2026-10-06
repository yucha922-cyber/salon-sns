import type { AccountGoal, AccountStrategy } from "@/lib/domain/types";

/**
 * Starting points per goal. Users edit them; the AI Account Strategist can
 * refine them with Brand Brain + location context. acquisition and
 * recruitment are first-class and intentionally use different funnels.
 */
export const FUNNELS: Record<AccountGoal, string[]> = {
  acquisition: ["認知", "悩み", "教育", "信頼", "来店", "予約"],
  recruitment: ["認知", "興味", "共感", "職場理解", "キャリア理解", "応募"],
  branding: ["認知", "共感", "信頼", "想起"],
  engagement: ["発見", "参加", "会話", "ファン化"],
  retention: ["来店後フォロー", "セルフケア", "再来店", "継続"],
  custom: ["認知", "興味", "行動"],
};

const base = {
  targetAudience: "",
  persona: "",
  preferredPostingTimes: ["12:00", "20:00"],
  notes: "",
};

export const GOAL_PRESETS: Record<AccountGoal, { description: string; strategy: AccountStrategy }> = {
  acquisition: {
    description: "新規来店・予約を増やす",
    strategy: {
      ...base,
      kpiTargets: [
        { metric: "プロフィールアクセス", target: null, unit: "回/月" },
        { metric: "LINE登録", target: null, unit: "件/月" },
        { metric: "予約数", target: null, unit: "件/月" },
      ],
      contentPillars: ["problem_awareness", "education", "selfcare", "before_after", "testimonial", "offer"],
      postsPerWeek: 4,
      postingFrequencyNote: "Reel2本・フィード2本",
      preferredPostingDays: [1, 3, 5, 0],
      cta: "LINE予約 / プロフィールリンクから予約",
      tone: "やさしく、専門用語はわかりやすく",
    },
  },
  recruitment: {
    description: "スタッフの応募を獲得する",
    strategy: {
      ...base,
      preferredPostingTimes: ["21:00"],
      kpiTargets: [
        { metric: "採用ページクリック", target: null, unit: "回/月" },
        { metric: "DM", target: null, unit: "件/月" },
        { metric: "応募数", target: null, unit: "件/月" },
      ],
      contentPillars: ["staff_story", "day_in_the_life", "training", "career", "benefits", "culture"],
      postsPerWeek: 2,
      postingFrequencyNote: "Reel1本・フィード1本",
      preferredPostingDays: [2, 6],
      cta: "採用ページ / DMで気軽に相談",
      tone: "等身大で誠実に、働く人の声を中心に",
    },
  },
  branding: {
    description: "ブランドの世界観と信頼をつくる",
    strategy: {
      ...base,
      kpiTargets: [
        { metric: "フォロワー数", target: null, unit: "人" },
        { metric: "エンゲージメント率", target: null, unit: "%" },
      ],
      contentPillars: ["brand_story", "expertise_column", "network"],
      postsPerWeek: 3,
      postingFrequencyNote: "世界観を揃えたフィード中心",
      preferredPostingDays: [1, 3, 5],
      cta: "お近くの店舗はプロフィールから",
      tone: "上品で一貫性のあるブランドトーン",
    },
  },
  engagement: {
    description: "フォロワーとの会話・反応を増やす",
    strategy: {
      ...base,
      kpiTargets: [
        { metric: "コメント数", target: null, unit: "件/月" },
        { metric: "保存数", target: null, unit: "件/月" },
      ],
      contentPillars: ["quiz", "behind_the_scenes", "selfcare"],
      postsPerWeek: 5,
      postingFrequencyNote: "短い投稿を高頻度で",
      preferredPostingDays: [1, 2, 3, 4, 5],
      cta: "コメントで教えてください",
      tone: "親しみやすく会話的に",
    },
  },
  retention: {
    description: "来店後のフォローとリピートを促す",
    strategy: {
      ...base,
      kpiTargets: [
        { metric: "再来店率", target: null, unit: "%" },
        { metric: "回数券購入", target: null, unit: "件/月" },
      ],
      contentPillars: ["aftercare", "selfcare", "member_info"],
      postsPerWeek: 3,
      postingFrequencyNote: "既存のお客様向けのケア情報",
      preferredPostingDays: [2, 4, 6],
      cta: "次回のご予約はLINEから",
      tone: "あたたかく、寄り添うように",
    },
  },
  custom: {
    description: "独自の目的を設定する",
    strategy: {
      ...base,
      kpiTargets: [],
      contentPillars: [],
      postsPerWeek: 3,
      postingFrequencyNote: "",
      preferredPostingDays: [1, 3, 5],
      cta: "",
      tone: "",
    },
  },
};

export function presetStrategy(goal: AccountGoal): AccountStrategy {
  const s = GOAL_PRESETS[goal].strategy;
  return structuredClone(s);
}
