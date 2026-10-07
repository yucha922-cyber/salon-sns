/**
 * Provider error model. Raw provider payloads never reach the UI: callers
 * get a kind (drives retry / reconnect logic) and a Japanese safe message.
 */
export type SocialErrorKind =
  | "token_expired"
  | "permission"
  | "rate_limited"
  | "invalid_content"
  | "media_processing"
  | "provider_unavailable"
  | "not_configured"
  | "unknown";

export class SocialApiError extends Error {
  constructor(
    readonly kind: SocialErrorKind,
    /** sanitized technical detail for logs (no tokens) */
    message: string,
    readonly options: { code?: string; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = "SocialApiError";
  }

  /** Whether the publish queue may retry this failure. */
  get retryable(): boolean {
    return this.kind === "rate_limited" || this.kind === "provider_unavailable" || this.kind === "unknown" || this.kind === "media_processing";
  }

  get userMessage(): string {
    return SOCIAL_ERROR_MESSAGES[this.kind];
  }
}

export const SOCIAL_ERROR_MESSAGES: Record<SocialErrorKind, string> = {
  token_expired: "SNSアカウントの認証が切れています。アカウント戦略画面から再接続してください。",
  permission: "投稿に必要な権限が許可されていません。再接続して、すべての権限を許可してください。",
  rate_limited: "SNS側の投稿上限・API制限に達しました。時間をおいて自動で再試行します。",
  invalid_content: "SNS側で投稿内容が受け付けられませんでした。画像・動画の形式や文字数を確認してください。",
  media_processing: "SNS側で画像・動画の処理に失敗しました。ファイル形式・サイズ・縦横比を確認してください。",
  provider_unavailable: "SNS側のサービスに接続できませんでした。時間をおいて自動で再試行します。",
  not_configured: "SNS連携の設定（Meta App）がされていません。管理者に連絡してください。",
  unknown: "投稿中に予期しないエラーが発生しました。時間をおいて再試行します。",
};

/** Removes anything that looks like a token / secret from a string. */
export function sanitize(text: string): string {
  return text
    .replace(/(access_token|client_secret|code|token)=([^&\s"']+)/gi, "$1=[redacted]")
    .replace(/\b(IG|TH|EA)[A-Za-z0-9_-]{20,}\b/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number | string;
    error_subcode?: number;
    error_user_msg?: string;
    is_transient?: boolean;
  };
  error_type?: string;
  error_message?: string;
  code?: number;
}

/**
 * Maps a Meta Graph error (Instagram / Threads share the format) to a kind.
 * Codes: 190 token (subcodes 458/460/463/467), 10/200-299 permission,
 * 4/17/32/613/80002 rate limit, 9004/9007/2207xxx media, 1/2 transient.
 */
export function fromGraphError(status: number, body: unknown, context: string, retryAfterHeader?: string | null): SocialApiError {
  const b = (body ?? {}) as GraphErrorBody;
  const err = b.error ?? {};
  const code = Number(err.code ?? b.code ?? 0);
  const sub = Number(err.error_subcode ?? 0);
  const text = sanitize(`${context}: [${status}] ${err.type ?? b.error_type ?? ""} ${code || ""}/${sub || ""} ${err.message ?? b.error_message ?? ""}`.trim());
  const codeLabel = `${code || status}${sub ? `/${sub}` : ""}`;
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) || undefined : undefined;

  if (code === 190 || (err.type === "OAuthException" && [458, 460, 463, 467].includes(sub))) return new SocialApiError("token_expired", text, { code: codeLabel });
  // 80000 ads_insights / 80004 ads_management (Marketing API Business Use Case), 613/1487742 ad-account limit
  if ([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80014].includes(code) || sub === 2207042 || sub === 1487742 || sub === 2446079 || status === 429) {
    return new SocialApiError("rate_limited", text, { code: codeLabel, retryAfterSeconds: retryAfter ?? 15 * 60 });
  }
  if (code === 10 || code === 294 || (code >= 200 && code <= 299)) return new SocialApiError("permission", text, { code: codeLabel });
  if (code === 9007 || sub === 2207027) return new SocialApiError("media_processing", text, { code: codeLabel, retryAfterSeconds: 60 });
  if (code === 9004 || code === 36003 || (sub >= 2207000 && sub < 2208000) || code === 100) {
    // media download failure is often transient (URL fetch); others are content problems
    const kind = sub === 2207052 || sub === 2207003 || sub === 2207001 ? "media_processing" : "invalid_content";
    return new SocialApiError(kind, text, { code: codeLabel });
  }
  if (status >= 500 || code === 1 || code === 2 || err.is_transient) return new SocialApiError("provider_unavailable", text, { code: codeLabel });
  if (status === 401) return new SocialApiError("token_expired", text, { code: codeLabel });
  if (status === 403) return new SocialApiError("permission", text, { code: codeLabel });
  return new SocialApiError("unknown", text, { code: codeLabel });
}
