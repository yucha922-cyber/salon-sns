/**
 * Threads publishing rules (Threads API v1.0, checked 2026-10).
 * Source: Meta Threads "Posts" docs + official sample (fbsamples/threads_api).
 * MVP formats: text, text + one image, text + one video.
 * Not supported in MVP: carousels, polls, link attachments, location tags.
 * Pure module (also used client-side for instant feedback).
 */
import { composePostText, threadsLength, uniqueLinks } from "../text";
import type { PublishFormat, ValidationInput, ValidationIssue, ValidationResult } from "../types";

export const THREADS_LIMITS = {
  textMax: 500,
  linksMax: 5,
  imageMaxBytes: 8 * 1024 * 1024,
  imageMimeTypes: ["image/jpeg", "image/png"],
  imageMaxRatio: 10,
  imageMinWidth: 320,
  videoMimeTypes: ["video/mp4", "video/quicktime"],
  videoMaxBytes: 1024 * 1024 * 1024,
  videoMaxMs: 300_000,
  videoMaxRatio: 10,
  dailyPublishLimit: 250,
} as const;

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

export function validateThreads(input: ValidationInput): ValidationResult {
  const L = THREADS_LIMITS;
  const issues: ValidationIssue[] = [];
  const err = (code: string, message: string, fix: string) => issues.push({ severity: "error", code, message, fix });
  const warn = (code: string, message: string, fix: string) => issues.push({ severity: "warning", code, message, fix });
  // Threads uses a single topic tag per post: only the first hashtag is kept.
  const text = composePostText(input, { maxHashtags: 1 });
  if (input.hashtags.filter((h) => h.trim()).length > 1) {
    warn("th.single_topic_tag", "Threadsはトピックタグが1投稿につき1つだけです。最初のハッシュタグのみ投稿されます。", "一番伝えたいテーマのハッシュタグを先頭にしてください。");
  }

  let format: PublishFormat | null = "THREADS_TEXT";
  if (input.media.length > 1) {
    err("th.carousel_unsupported", "Threadsのカルーセル（複数メディア）は現在このアプリでは未対応です。", "画像または動画を1つにしてください。");
    format = null;
  }
  const m = input.media[0];
  if (m?.kind === "image") {
    format = "THREADS_IMAGE";
    if (!(L.imageMimeTypes as readonly string[]).includes(m.mimeType)) err("th.image_format", `画像の形式（${m.mimeType}）は投稿できません。`, "JPEGまたはPNGで保存し直してください。");
    if (m.sizeBytes > L.imageMaxBytes) err("th.image_size", `画像が${mb(m.sizeBytes)}です（上限8MB）。`, "画像を圧縮してください。");
    if (m.width && m.height) {
      const ratio = Math.max(m.width / m.height, m.height / m.width);
      if (ratio > L.imageMaxRatio) err("th.image_ratio", "画像の縦横比が極端です（上限10:1）。", "画像をトリミングしてください。");
      if (m.width < L.imageMinWidth) warn("th.image_small", `画像の幅が${m.width}pxです。拡大されて粗く見える可能性があります。`, "幅1080px程度の画像を推奨します。");
    }
  } else if (m?.kind === "video") {
    format = "THREADS_VIDEO";
    if (!(L.videoMimeTypes as readonly string[]).includes(m.mimeType)) err("th.video_format", `動画の形式（${m.mimeType}）は投稿できません。`, "MP4（H.264/AAC）またはMOVで書き出してください。");
    if (m.sizeBytes > L.videoMaxBytes) err("th.video_size", `動画が${mb(m.sizeBytes)}です（上限1GB）。`, "動画を圧縮してください。");
    if (m.durationMs !== null && m.durationMs > L.videoMaxMs) err("th.video_long", "Threadsの動画は5分以内です。", "動画を5分以内に編集してください。");
    if (m.durationMs === null) warn("th.video_duration_unknown", "動画の長さを確認できませんでした。", "動画を再アップロードすると長さのチェックができます。");
  }

  const length = threadsLength(text);
  if (!text.trim() && !m) err("th.text_required", "テキストが空です。", "本文を入力してください。");
  if (length > L.textMax) {
    err("th.text_long", `本文が約${length}文字です（Threadsの上限500文字、絵文字はバイト数で計算）。`, `本文を${length - L.textMax}文字以上短くするか、詳細はInstagramやWebへ誘導してください。`);
  } else if (length > L.textMax - 30) {
    warn("th.text_near_limit", `本文が約${length}文字で上限（500文字）に近づいています。`, "日本語・絵文字のカウント方法により超過する可能性があるため、少し短くすることをおすすめします。");
  }
  const links = uniqueLinks(text).length;
  if (links > L.linksMax) err("th.links", `リンクが${links}件あります（上限${L.linksMax}件）。`, "リンクを5件以内に減らしてください。");

  const hasError = issues.some((i) => i.severity === "error");
  return { ok: !hasError, format: hasError ? null : format, issues, text };
}
