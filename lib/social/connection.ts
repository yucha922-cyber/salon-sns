/** Connection status helpers (pure, client-safe). */
import type { ConnectionBadge, SocialConnectionInfo } from "./types";

export const TOKEN_EXPIRING_DAYS = 7;

export function emptyConnection(): SocialConnectionInfo {
  return {
    status: "manual",
    externalAccountId: null,
    username: "",
    profileImageUrl: null,
    tokenExpiresAt: null,
    scopes: [],
    connectedAt: null,
    lastSyncedAt: null,
    error: null,
    metadata: {},
  };
}

export function connectionBadge(c: SocialConnectionInfo, now: Date = new Date()): ConnectionBadge {
  switch (c.status) {
    case "connected": {
      if (c.tokenExpiresAt) {
        const left = new Date(c.tokenExpiresAt).getTime() - now.getTime();
        if (left <= 0) return "reconnect";
        if (left < TOKEN_EXPIRING_DAYS * 86_400_000) return "expiring";
      }
      return "connected";
    }
    case "expired":
    case "reauthorization_required":
      return "reconnect";
    case "error":
      return "error";
    case "disconnected":
      return "disconnected";
    default:
      return "not_connected";
  }
}

export const CONNECTION_BADGE_LABELS: Record<ConnectionBadge, string> = {
  connected: "Connected",
  expiring: "Token Expiring",
  reconnect: "Reconnect Required",
  error: "Error",
  disconnected: "Disconnected",
  not_connected: "未接続",
};

export const CONNECTION_BADGE_HINTS: Record<ConnectionBadge, string> = {
  connected: "投稿・Insights取得が可能です",
  expiring: "トークンの有効期限が近づいています（自動更新に失敗した場合は再接続してください）",
  reconnect: "認証が切れています。再接続するまで予約投稿は実行されません",
  error: "接続でエラーが発生しています。再接続をお試しください",
  disconnected: "接続を解除しました",
  not_connected: "アカウントIDのみ登録済み。投稿するにはSNS連携が必要です",
};

/** Whether the publish queue may use this connection. */
export function canPublishWith(c: SocialConnectionInfo, now: Date = new Date()): boolean {
  const badge = connectionBadge(c, now);
  return badge === "connected" || badge === "expiring";
}
