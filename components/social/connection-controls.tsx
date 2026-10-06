"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SnsAccount } from "@/lib/domain/types";
import { connectionBadge } from "@/lib/social/connection";
import { disconnectAccountAction } from "@/app/actions/social";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ConnectionBadge } from "./connection-badge";

const formatDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";

/** Connection status + Connect / Reconnect / Disconnect for one social account. */
export function ConnectionControls({ account, canManage }: { account: SnsAccount; canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  const supported = account.platform === "instagram" || account.platform === "threads";
  const c = account.connection;
  const badge = connectionBadge(c);
  const connectHref = `/api/social/connect/${account.platform}?account=${account.id}`;

  if (!supported) return <div className="conn-row"><span className="status-pill draft">API連携は今後対応予定</span></div>;

  const disconnect = () =>
    startTransition(async () => {
      const result = await disconnectAccountAction(account.id);
      if (!result.ok) return toast(result.error, "error");
      toast(`${account.handle} の接続を解除しました`);
      setConfirm(false);
      router.refresh();
    });

  return (
    <div className="conn-row">
      <ConnectionBadge badge={badge} />
      {badge !== "not_connected" && badge !== "disconnected" && (
        <span className="activity-note" title={c.scopes.join(", ")}>
          {c.username ? `@${c.username}` : ""} · 期限 {formatDate(c.tokenExpiresAt)} · 同期 {formatDate(c.lastSyncedAt)}
        </span>
      )}
      {canManage && (
        <span className="conn-actions">
          {badge === "not_connected" || badge === "disconnected" ? (
            <a className="button small primary" href={connectHref}>{account.platform === "instagram" ? "Instagramを接続" : "Threadsを接続"}</a>
          ) : badge === "reconnect" || badge === "error" || badge === "expiring" ? (
            <a className="button small primary" href={connectHref}>再接続</a>
          ) : null}
          {(badge === "connected" || badge === "expiring" || badge === "reconnect" || badge === "error") && (
            <button className="button small" onClick={() => setConfirm(true)}>接続解除</button>
          )}
        </span>
      )}
      {c.error && badge !== "connected" && <div className="field-hint conn-error">{c.error}</div>}
      <Modal
        open={confirm}
        title="SNS連携を解除しますか？"
        intro={`${account.handle} のアクセストークンを削除します。予約済みの投稿はすべて取り消され、「投稿承認済み」に戻ります。`}
        onClose={() => setConfirm(false)}
        actions={
          <>
            <button className="button" onClick={() => setConfirm(false)}>キャンセル</button>
            <button className="button primary" onClick={disconnect} disabled={pending}>{pending && <Spinner />} 接続を解除する</button>
          </>
        }
      >
        <p className="field-hint">Instagram / Threads 側のアプリ連携も解除する場合は、各アプリの設定（アプリとウェブサイト）から削除してください。</p>
      </Modal>
    </div>
  );
}
