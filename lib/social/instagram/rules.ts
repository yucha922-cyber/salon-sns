/**
 * Instagram publishing rules (Instagram API with Instagram Login, Graph v26.0).
 * Source: Meta "Content Publishing" + "IG User Media" reference (checked 2026-10).
 * MVP formats: single image (JPEG), carousel (2–10 images), Reel (video).
 * Not supported in MVP: Stories, video carousels, product / user tags.
 * Pure module (also used client-side for instant feedback).
 */
import { charLength, composePostText, countHashtags, countMentions } from "../text";
import type { PublishFormat, ValidationInput, ValidationIssue, ValidationResult } from "../types";

export const INSTAGRAM_LIMITS = {
  captionMax: 2200,
  hashtagsMax: 30,
  mentionsMax: 20,
  imageMaxBytes: 8 * 1024 * 1024,
  imageMimeTypes: ["image/jpeg"],
  imageMinRatio: 4 / 5, // 0.8
  imageMaxRatio: 1.91,
  imageMinWidth: 320,
  imageMaxWidth: 1440,
  carouselMin: 2,
  carouselMax: 10,
  reelMimeTypes: ["video/mp4", "video/quicktime"],
  reelMaxBytes: 300 * 1024 * 1024,
  reelMinMs: 3_000,
  reelMaxMs: 15 * 60_000,
  reelMinRatio: 0.01,
  reelMaxRatio: 10,
  dailyPublishLimit: 100,
} as const;

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

export function validateInstagram(input: ValidationInput): ValidationResult {
  const L = INSTAGRAM_LIMITS;
  const issues: ValidationIssue[] = [];
  const err = (code: string, message: string, fix: string) => issues.push({ severity: "error", code, message, fix });
  const warn = (code: string, message: string, fix: string) => issues.push({ severity: "warning", code, message, fix });
  const text = composePostText(input);
  const images = input.media.filter((m) => m.kind === "image");
  const videos = input.media.filter((m) => m.kind === "video");

  let format: PublishFormat | null = null;
  if (input.contentType === "story") {
    err("ig.story_unsupported", "ストーリーズの自動投稿は現在このアプリでは未対応です。", "フィード（画像）・カルーセル・Reelに変更するか、Instagramアプリから手動で投稿してください。");
  } else if (input.media.length === 0) {
    err("ig.media_required", "Instagramは画像または動画が必須です（テキストのみの投稿はできません）。", "投稿に画像（JPEG）または動画（MP4/MOV）を追加してください。");
  } else if (videos.length > 0 && input.media.length > 1) {
    err("ig.mixed_carousel_unsupported", "動画を含むカルーセルは現在未対応です。", "動画はReelとして1本だけで投稿するか、カルーセルを画像のみにしてください。");
  } else if (videos.length === 1) {
    format = "IG_REEL";
  } else if (images.length === 1) {
    format = input.contentType === "reel" ? null : "IG_IMAGE";
    if (input.contentType === "reel") err("ig.reel_needs_video", "Reelには動画が必要です。", "動画ファイル（MP4/MOV、3秒〜15分）を追加するか、投稿タイプをフィードに変更してください。");
  } else if (images.length > L.carouselMax) {
    err("ig.carousel_too_many", `カルーセルは最大${L.carouselMax}枚です（現在${images.length}枚）。`, `画像を${L.carouselMax}枚以内に減らしてください。`);
  } else {
    format = "IG_CAROUSEL";
  }

  for (const [i, m] of images.entries()) {
    const label = images.length > 1 ? `${i + 1}枚目の画像` : "画像";
    if (!(L.imageMimeTypes as readonly string[]).includes(m.mimeType)) {
      err("ig.image_format", `${label}の形式（${m.mimeType}）はInstagram APIで投稿できません。JPEGのみ対応です。`, "画像をJPEG（.jpg）に書き出し直してアップロードしてください。");
    }
    if (m.sizeBytes > L.imageMaxBytes) err("ig.image_size", `${label}が${mb(m.sizeBytes)}です（上限8MB）。`, "画像を圧縮するか、長辺1440px程度に縮小してください。");
    if (m.width && m.height) {
      const ratio = m.width / m.height;
      if (ratio < L.imageMinRatio - 0.005 || ratio > L.imageMaxRatio + 0.005) {
        err("ig.image_ratio", `${label}の縦横比（${m.width}×${m.height}）が範囲外です。4:5（縦長）〜1.91:1（横長）に対応しています。`, "1080×1350（4:5）または1080×1080（1:1）にトリミングしてください。");
      }
      if (m.width < L.imageMinWidth) warn("ig.image_small", `${label}の幅が${m.width}pxです。Instagram側で拡大され、粗く見える可能性があります。`, "幅1080px以上の画像を推奨します。");
    } else {
      warn("ig.image_dims_unknown", `${label}のサイズ（縦横）を確認できませんでした。`, "画像を再アップロードすると縦横比のチェックができます。");
    }
  }
  if (format === "IG_CAROUSEL" && images.length >= 2) {
    const ratios = images.filter((m) => m.width && m.height).map((m) => (m.width ?? 1) / (m.height ?? 1));
    if (ratios.some((r) => Math.abs(r - (ratios[0] ?? r)) > 0.01)) {
      warn("ig.carousel_ratio_mismatch", "カルーセルの画像の縦横比が揃っていません。1枚目の比率に合わせて切り抜かれます。", "すべての画像を同じ縦横比（例：4:5）にそろえてください。");
    }
  }
  for (const m of videos) {
    if (!(L.reelMimeTypes as readonly string[]).includes(m.mimeType)) err("ig.video_format", `動画の形式（${m.mimeType}）は投稿できません。`, "MP4（H.264/AAC）またはMOVで書き出してください。");
    if (m.sizeBytes > L.reelMaxBytes) err("ig.video_size", `動画が${mb(m.sizeBytes)}です（Reelの上限300MB）。`, "ビットレートを下げるか、動画を短くしてください。");
    if (m.durationMs !== null) {
      if (m.durationMs < L.reelMinMs) err("ig.video_short", "Reelは3秒以上の動画が必要です。", "3秒以上の動画を使用してください。");
      if (m.durationMs > L.reelMaxMs) err("ig.video_long", "Reelは15分以内の動画のみ投稿できます。", "動画を15分以内に編集してください。");
    } else {
      warn("ig.video_duration_unknown", "動画の長さを確認できませんでした。", "動画を再アップロードすると長さのチェックができます。");
    }
    if (m.width && m.height) {
      const ratio = m.width / m.height;
      if (ratio < L.reelMinRatio || ratio > L.reelMaxRatio) err("ig.video_ratio", "動画の縦横比が範囲外です。", "9:16（1080×1920）で書き出してください。");
      else if (Math.abs(ratio - 9 / 16) > 0.02) warn("ig.video_ratio_recommend", `動画の縦横比が${m.width}×${m.height}です。Reelは9:16が推奨です。`, "1080×1920（9:16）で書き出すと全画面で表示されます。");
    }
  }

  const length = charLength(text);
  if (length > L.captionMax) err("ig.caption_long", `キャプションが${length}文字です（上限${L.captionMax}文字、ハッシュタグ・CTA込み）。`, `本文を${length - L.captionMax}文字以上短くしてください。`);
  const tags = countHashtags(text);
  if (tags > L.hashtagsMax) err("ig.hashtags", `ハッシュタグが${tags}個あります（上限${L.hashtagsMax}個）。`, `ハッシュタグを${L.hashtagsMax}個以内に減らしてください（5〜10個程度を推奨）。`);
  const mentions = countMentions(text);
  if (mentions > L.mentionsMax) err("ig.mentions", `@メンションが${mentions}件あります（上限${L.mentionsMax}件）。`, "メンションを減らしてください。");
  if (!text.trim()) warn("ig.caption_empty", "キャプションが空です。", "保存・予約につながる一言とCTAを入れることをおすすめします。");

  return { ok: !issues.some((i) => i.severity === "error"), format: issues.some((i) => i.severity === "error") ? null : format, issues, text };
}
