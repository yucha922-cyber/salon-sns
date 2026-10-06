import type { CampaignStatus, ContentType, PostStatus, SocialPlatform } from "./types";

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  threads: "Threads",
  tiktok: "TikTok",
  facebook: "Facebook",
};

export const PLATFORM_ICONS: Record<SocialPlatform, string> = {
  instagram: "◎",
  threads: "@",
  tiktok: "♪",
  facebook: "f",
};

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  feed: "フィード",
  carousel: "カルーセル",
  reel: "Reel",
  story: "ストーリーズ",
  text: "テキスト",
  short_video: "ショート動画",
  threads_text: "Threadsテキスト",
  before_after: "Before/After",
  staff: "スタッフ紹介",
  educational: "教育・解説",
  testimonial: "お客様の声",
  offer: "オファー告知",
};

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  draft: "下書き",
  scheduled: "予約済み",
  published: "公開済み",
  failed: "失敗",
};

/** Extra CSS modifier for .status-pill */
export const POST_STATUS_PILL: Record<PostStatus, string> = {
  draft: "draft",
  scheduled: "",
  published: "",
  failed: "failed",
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  active: "配信中",
  paused: "停止中",
  needs_review: "要確認",
};

export const ACCOUNT_GOAL_LABELS: Record<import("./types").AccountGoal, string> = {
  acquisition: "集客",
  recruitment: "採用",
  branding: "ブランディング",
  engagement: "エンゲージメント",
  retention: "リピート・定着",
  custom: "カスタム",
};

export const HQ_STATUS_LABELS: Record<import("./types").HqCampaignStatus, string> = {
  draft: "準備中",
  active: "実施中",
  completed: "完了",
  archived: "アーカイブ",
};

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

export const RECOMMENDATION_CATEGORY_LABELS: Record<import("./types").RecommendationCategory, string> = {
  social: "SNS運用",
  ads: "広告",
  creative: "クリエイティブ",
  strategy: "戦略",
  recruitment: "採用",
  acquisition: "集客",
};

export const RECOMMENDATION_STATUS_LABELS: Record<import("./types").RecommendationStatus, string> = {
  pending: "承認待ち",
  approved: "承認済み",
  rejected: "却下",
  completed: "完了",
};

export const SEVERITY_LABELS: Record<import("./types").Severity, string> = { low: "低", medium: "中", high: "高" };

export function goalLabel(goal: import("./types").AccountGoal, customGoal = ""): string {
  return goal === "custom" && customGoal.trim() ? customGoal.trim() : ACCOUNT_GOAL_LABELS[goal];
}
