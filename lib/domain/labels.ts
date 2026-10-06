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
