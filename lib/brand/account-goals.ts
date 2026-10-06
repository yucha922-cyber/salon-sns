import type { AccountGoal, AccountStrategy } from "@/lib/domain/types";

/** Starting points per goal. Users edit them; AI can refine them with Brand Brain context. */
export const GOAL_PRESETS: Record<AccountGoal, { description: string; strategy: AccountStrategy }> = {
  acquisition: {
    description: "新規来店・予約を増やす店舗アカウント",
    strategy: {
      persona: "",
      kpis: ["プロフィール経由の予約数", "保存数", "プロフィールアクセス数"],
      contentPillars: ["お悩み解決How-to", "施術・メニュー紹介", "お客様の声（許諾済み）", "キャンペーン告知"],
      postsPerWeek: 4,
      postingFrequencyNote: "フィード2本・Reel2本",
      cta: "ご予約はプロフィールのリンクから",
      tone: "やさしく、専門用語はわかりやすく",
    },
  },
  recruitment: {
    description: "スタッフ採用のための採用アカウント",
    strategy: {
      persona: "",
      kpis: ["応募数", "説明会・見学申込数", "プロフィールアクセス数"],
      contentPillars: ["スタッフの1日", "働く環境・福利厚生", "教育・キャリアパス", "代表メッセージ"],
      postsPerWeek: 2,
      postingFrequencyNote: "Reel1本・フィード1本",
      cta: "見学・カジュアル面談はDMまたはプロフィールのリンクから",
      tone: "等身大で誠実に、働く人の声を中心に",
    },
  },
  branding: {
    description: "ブランドの世界観と信頼をつくる本部アカウント",
    strategy: {
      persona: "",
      kpis: ["フォロワー数", "エンゲージメント率", "指名検索数"],
      contentPillars: ["ブランドの想い", "専門知識・コラム", "店舗ネットワーク紹介", "季節のキャンペーン"],
      postsPerWeek: 3,
      postingFrequencyNote: "世界観を揃えたフィード中心",
      cta: "お近くの店舗はプロフィールから",
      tone: "上品で一貫性のあるブランドトーン",
    },
  },
};
