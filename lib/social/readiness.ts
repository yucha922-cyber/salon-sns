/**
 * Publish readiness (pure): decides whether a post can be approved, scheduled
 * or published now, and explains every blocker with a concrete fix.
 * Used by the server (authoritative) and by the UI (instant feedback).
 */
import type { Post, SnsAccount } from "@/lib/domain/types";
import { canPublishWith, connectionBadge } from "./connection";
import type { MediaAsset, PublishJob, ValidationIssue, ValidationResult } from "./types";
import { isPublishablePlatform } from "./types";
import { validateForPlatform } from "./validation";

export interface PublishReadiness {
  validation: ValidationResult | null;
  /** problems that are not about the content itself (account, media upload, time) */
  blockers: ValidationIssue[];
  canApprove: boolean;
  canSchedule: boolean;
  canPublishNow: boolean;
  activeJob: PublishJob | null;
}

const MIN_LEAD_MS = 60_000;

export function evaluateReadiness(input: {
  post: Post;
  account: SnsAccount | null;
  media: MediaAsset[];
  activeJob: PublishJob | null;
  now?: Date;
}): PublishReadiness {
  const { post, account, media, activeJob } = input;
  const now = input.now ?? new Date();
  const blockers: ValidationIssue[] = [];
  const block = (code: string, message: string, fix: string) => blockers.push({ severity: "error", code, message, fix });

  if (!isPublishablePlatform(post.platform)) {
    block("platform.unsupported", "このプラットフォームの自動投稿には未対応です（Instagram / Threadsのみ）。", "各SNSアプリから手動で投稿し、ステータスを「公開済み」にしてください。");
    return { validation: null, blockers, canApprove: false, canSchedule: false, canPublishNow: false, activeJob };
  }
  const validation = validateForPlatform({
    platform: post.platform,
    contentType: post.contentType,
    caption: post.caption,
    cta: post.cta,
    hashtags: post.hashtags,
    media: media.filter((m) => m.status === "ready"),
  });
  if (media.some((m) => m.status !== "ready")) block("media.pending", "アップロードが完了していない画像・動画があります。", "アップロードをやり直すか、未完了のファイルを削除してください。");

  if (!account) {
    block("account.missing", "投稿先のSNSアカウントが設定されていません。", "投稿の「投稿先アカウント」を選択してください。");
  } else if (account.platform !== post.platform) {
    block("account.platform", "投稿先アカウントのプラットフォームが投稿と一致しません。", "同じプラットフォームのアカウントを選択してください。");
  } else if (!canPublishWith(account.connection, now)) {
    const badge = connectionBadge(account.connection, now);
    block(
      "account.not_connected",
      badge === "reconnect" ? `${account.handle} の認証が切れています。` : `${account.handle} はまだSNS連携されていません。`,
      "アカウント戦略画面で「接続」または「再接続」を行ってください。",
    );
  }

  const contentOk = validation.ok;
  const editable = post.status === "draft" || post.status === "scheduled" || post.status === "failed";
  const approved = post.status === "approved";
  const future = post.scheduledAt !== null && new Date(post.scheduledAt).getTime() - now.getTime() >= MIN_LEAD_MS;
  const ready = contentOk && blockers.length === 0 && !activeJob;
  return {
    validation,
    blockers,
    canApprove: editable && contentOk && !media.some((m) => m.status !== "ready"),
    canSchedule: approved && ready && future,
    canPublishNow: approved && ready,
    activeJob,
  };
}
