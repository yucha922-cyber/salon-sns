"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { Post } from "@/lib/domain/types";
import { PLATFORM_LABELS } from "@/lib/domain/labels";
import { formatInZone } from "@/lib/domain/timezone";
import { formatNumber, formatPercent, rates } from "@/lib/social/metrics";
import { PUBLISH_FORMAT_LABELS } from "@/lib/social/validation";
import {
  approvePostAction,
  cancelPublishJobAction,
  confirmMediaUploadAction,
  deleteMediaAction,
  getPublishPanelAction,
  prepareMediaUploadAction,
  publishNowAction,
  resetFailedPostAction,
  reviewPostAction,
  schedulePostAction,
  setPostAccountAction,
  syncPostInsightsAction,
  type PublishPanelState,
} from "@/app/actions/social";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ConnectionBadge } from "./connection-badge";

const STEPS = [
  { key: "draft", label: "下書き" },
  { key: "approved", label: "投稿承認" },
  { key: "queued", label: "予約（Queue）" },
  { key: "publishing", label: "投稿" },
  { key: "published", label: "公開・計測" },
] as const;

function stepIndex(status: string): number {
  if (status === "approved") return 1;
  if (status === "queued") return 2;
  if (status === "publishing") return 3;
  if (status === "published") return 4;
  return 0;
}

/** Reads width/height/duration in the browser (server re-checks size; Meta re-validates on publish). */
async function readMediaMeta(file: File): Promise<{ width: number | null; height: number | null; durationMs: number | null }> {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("image/")) {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { width: img.naturalWidth, height: img.naturalHeight, durationMs: null };
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video"));
    });
    return { width: video.videoWidth || null, height: video.videoHeight || null, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null };
  } catch {
    return { width: null, height: null, durationMs: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PublishPanel({ post, readOnly, onStatusChange }: { post: Post; readOnly: boolean; onStatusChange?: (status: Post["status"]) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<PublishPanelState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"schedule" | "now" | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const result = await getPublishPanelAction(post.id);
    if (result.ok) {
      setState(result.data);
      setLoadError(null);
      onStatusChange?.(result.data.postStatus as Post["status"]);
    } else setLoadError(result.error);
  }, [post.id, onStatusChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) toast(result.error, "error");
      else toast(success);
      await load();
      router.refresh();
    });

  const upload = async (file: File) => {
    if (!state) return;
    if (file.size > state.uploadLimitBytes) return toast(`ファイルが大きすぎます（上限 ${Math.round(state.uploadLimitBytes / 1024 / 1024)}MB）`, "error");
    setUploading(true);
    try {
      const meta = await readMediaMeta(file);
      const prepared = await prepareMediaUploadAction({ postId: post.id, mimeType: file.type, sizeBytes: file.size, ...meta });
      if (!prepared.ok) return toast(prepared.error, "error");
      const res = await fetch(prepared.data.upload.url, { method: "PUT", headers: prepared.data.upload.headers, body: file });
      if (!res.ok) {
        await deleteMediaAction(prepared.data.mediaId);
        return toast("アップロードに失敗しました。もう一度お試しください", "error");
      }
      const confirmed = await confirmMediaUploadAction(prepared.data.mediaId);
      if (!confirmed.ok) return toast(confirmed.error, "error");
      toast("メディアを追加しました");
    } finally {
      setUploading(false);
      await load();
      router.refresh();
    }
  };

  const attachSample = async () => {
    const blob = await (await fetch("/demo/sample-post.jpg")).blob();
    await upload(new File([blob], "sample-post.jpg", { type: "image/jpeg" }));
  };

  if (loadError) return <div className="publish-panel"><div className="form-error">{loadError}</div></div>;
  if (!state) return <div className="publish-panel"><span className="activity-note"><Spinner /> 公開設定を読み込み中…</span></div>;

  const s = state;
  const current = stepIndex(s.postStatus);
  const errors = s.validationIssues.filter((i) => i.severity === "error");
  const warnings = s.validationIssues.filter((i) => i.severity === "warning");
  const frozen = s.postStatus === "queued" || s.postStatus === "publishing" || s.postStatus === "published";
  const editable = !readOnly && !frozen;

  return (
    <section className="publish-panel" aria-label="SNSへの公開">
      <div className="panel-title">SNSへの公開</div>
      <div className="publish-steps" aria-label="公開ステップ">
        {STEPS.map((step, i) => (
          <span key={step.key} className={i < current ? "done" : i === current ? "current" : ""}>{i + 1}. {step.label}</span>
        ))}
        {s.postStatus === "failed" && <span className="current" style={{ background: "#c0554c" }}>失敗</span>}
      </div>

      <div className="two-fields">
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="publishAccount">投稿先アカウント</label>
          <select
            id="publishAccount"
            className="select"
            value={s.account?.id ?? ""}
            disabled={!editable || busy}
            onChange={(e) => run(() => setPostAccountAction({ postId: post.id, accountId: e.target.value || null }), "投稿先を変更しました")}
          >
            <option value="">未選択</option>
            {s.accountOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>接続状態 / 形式</label>
          <div style={{ display: "flex", gap: 6, alignItems: "center", minHeight: 35, flexWrap: "wrap" }}>
            {s.account ? <ConnectionBadge badge={s.account.badge} /> : <span className="activity-note">アカウント未選択</span>}
            {s.format && <span className="loc-pill">{PUBLISH_FORMAT_LABELS[s.format]}</span>}
            {s.account?.mock && <span className="demo-mode-pill">Mock</span>}
          </div>
        </div>
      </div>

      {(post.platform === "instagram" || post.platform === "threads") && (
        <div>
          <div className="field-hint" style={{ margin: "0 0 6px" }}>
            画像・動画 {post.platform === "instagram" ? "（Instagramは必須：JPEG画像 / カルーセル2〜10枚 / Reel動画）" : "（任意：画像1枚 または 動画1本）"}
          </div>
          <div className="media-strip">
            {s.media.map((m) => (
              <div className="media-tile" key={m.id}>
                {m.previewUrl && m.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.previewUrl} alt="投稿画像" />
                ) : m.previewUrl ? (
                  <video src={m.previewUrl} muted />
                ) : (
                  <div style={{ height: 76, display: "grid", placeItems: "center" }}>{m.status === "failed" ? "失敗" : "処理中"}</div>
                )}
                <span>{m.width && m.height ? `${m.width}×${m.height}` : m.kind}{m.durationMs ? ` · ${Math.round(m.durationMs / 1000)}秒` : ""}</span>
                {editable && <button aria-label="メディアを削除" onClick={() => run(() => deleteMediaAction(m.id), "削除しました")}>×</button>}
              </div>
            ))}
            {editable && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
                <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,video/mp4,video/quicktime" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
                <button className="button small" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? <Spinner /> : "＋"} 画像・動画を追加</button>
                {s.account?.mock && <button className="button small soft" onClick={() => void attachSample()} disabled={uploading}>サンプル画像を使う</button>}
              </div>
            )}
          </div>
        </div>
      )}

      {(errors.length > 0 || s.blockers.length > 0 || warnings.length > 0) && !frozen && (
        <ul className="issue-list" aria-label="投稿前チェック">
          {[...s.blockers, ...errors].map((i) => (
            <li className="issue error" key={i.code}><b>✕ {i.message}</b><small>直し方：{i.fix}</small></li>
          ))}
          {warnings.map((i) => (
            <li className="issue warning" key={i.code}><b>! {i.message}</b><small>{i.fix}</small></li>
          ))}
        </ul>
      )}
      {!frozen && errors.length === 0 && s.blockers.length === 0 && <div className="form-success" style={{ margin: 0 }}>✓ {PLATFORM_LABELS[post.platform]}の投稿ルールを満たしています</div>}

      {s.activeJob && (
        <div className="recommendation-callout">
          <b>{s.activeJob.status === "publishing" ? "投稿処理中" : s.activeJob.status === "retrying" ? "再試行待ち" : s.activeJob.mode === "immediate" ? "まもなく投稿" : "予約済み"}</b>
          ：{formatInZone(s.activeJob.status === "retrying" ? s.activeJob.nextAttemptAt : s.activeJob.scheduledAt, s.timezone)}（{s.timezone}）
          {s.activeJob.attemptCount > 0 && ` · 試行 ${s.activeJob.attemptCount}/${s.activeJob.maxAttempts}`}
          {s.activeJob.lastError && <div className="field-hint" style={{ margin: "4px 0 0" }}>直近のエラー：{s.publishing.error ?? s.activeJob.lastError}</div>}
        </div>
      )}
      {s.postStatus === "failed" && s.publishing.error && <div className="form-error" style={{ margin: 0 }}>投稿に失敗しました：{s.publishing.error}</div>}

      {s.postStatus === "published" && (
        <div>
          <div className="form-success" style={{ margin: "0 0 8px" }}>
            ✓ {formatInZone(s.publishing.publishedAt, s.timezone)} に公開されました
            {s.publishing.permalink && <> · <a className="link-button" href={s.publishing.permalink} target="_blank" rel="noreferrer">投稿を開く ↗</a></>}
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>時点</th><th>リーチ/閲覧</th><th>いいね</th><th>保存</th><th>シェア</th><th>ER</th><th>保存率</th></tr></thead>
              <tbody>
                {s.checkpoints.map((cp) => {
                  const r = cp.metrics ? rates(cp.metrics) : {};
                  return (
                    <tr key={cp.label}>
                      <td>{cp.label}</td>
                      {cp.metrics ? (
                        <>
                          <td>{formatNumber(cp.metrics.reach ?? cp.metrics.views)}</td>
                          <td>{formatNumber(cp.metrics.likes)}</td>
                          <td>{formatNumber(cp.metrics.saves)}</td>
                          <td>{formatNumber(cp.metrics.shares)}</td>
                          <td>{formatPercent(r.engagementRate)}</td>
                          <td>{formatPercent(r.saveRate)}</td>
                        </>
                      ) : (
                        <td colSpan={6} className="table-muted">未取得（自動で取得されます）</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {s.review ? (
            <div className="review-box" style={{ marginTop: 8 }}>
              <b>✳ AI Performance Review</b>（確度 {Math.round(s.review.confidence * 100)}%）
              <p style={{ margin: "4px 0" }}>{s.review.summary}</p>
              {s.review.whatWorked.length > 0 && <><b>良かった点</b><ul>{s.review.whatWorked.map((w) => <li key={w}>{w}</li>)}</ul></>}
              {s.review.whatDidNotWork.length > 0 && <><b>課題</b><ul>{s.review.whatDidNotWork.map((w) => <li key={w}>{w}</li>)}</ul></>}
              <b>学び</b>：{s.review.keyLearning}<br />
              <b>次の一手</b>：{s.review.recommendedNextAction}<br />
              <b>次のクリエイティブ仮説</b>：{s.review.nextCreativeHypothesis}
            </div>
          ) : null}
          {!readOnly && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <button className="button small" disabled={busy} onClick={() => run(() => syncPostInsightsAction(post.id), "Insightsを取得しました")}>{busy && <Spinner />} Insightsを今すぐ取得</button>
              <button className="button small soft" disabled={busy || !s.checkpoints.some((c) => c.metrics)} onClick={() => run(() => reviewPostAction(post.id), "AI分析を作成し、Marketing Memoryに保存しました")}>✳ AIで成果を分析</button>
            </div>
          )}
        </div>
      )}

      {!readOnly && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {s.canApprove && <button className="button small primary" disabled={busy} onClick={() => run(() => approvePostAction(post.id), "投稿内容を承認しました")}>✓ 投稿内容を承認</button>}
          {s.postStatus === "approved" && (
            <>
              <button className="button small primary" disabled={busy || !s.canSchedule} onClick={() => { setChecked(false); setConfirm("schedule"); }} title={s.canSchedule ? "" : "未来の投稿日時と接続済みアカウントが必要です"}>◷ 予約投稿に登録</button>
              <button className="button small" disabled={busy || !s.canPublishNow} onClick={() => { setChecked(false); setConfirm("now"); }}>▶ 今すぐ投稿</button>
            </>
          )}
          {s.activeJob && (s.activeJob.status === "queued" || s.activeJob.status === "retrying") && (
            <button className="button small" disabled={busy} onClick={() => run(() => cancelPublishJobAction(s.activeJob?.id), "予約を取り消しました（承認済みに戻りました）")}>予約を取り消す</button>
          )}
          {s.postStatus === "failed" && <button className="button small" disabled={busy} onClick={() => run(() => resetFailedPostAction(post.id), "承認済みに戻しました。原因を直して再度予約してください")}>承認済みに戻して再予約</button>}
        </div>
      )}

      <Modal
        open={confirm !== null}
        title={confirm === "now" ? "今すぐ投稿しますか？" : "この内容で予約しますか？"}
        intro={confirm === "now" ? "確認後すぐにSNSへ公開されます。公開後の取り消しは各SNSアプリから行う必要があります。" : "予約時刻になると、画面を開いていなくても自動で投稿されます。"}
        onClose={() => setConfirm(null)}
        actions={
          <>
            <button className="button" onClick={() => setConfirm(null)}>キャンセル</button>
            <button
              className="button primary"
              disabled={busy || !checked}
              onClick={() => {
                const mode = confirm;
                setConfirm(null);
                if (mode === "now") {
                  startTransition(async () => {
                    const result = await publishNowAction(post.id);
                    if (!result.ok) toast(result.error, "error");
                    else toast(result.data.message, result.data.status === "failed" ? "error" : undefined);
                    await load();
                    router.refresh();
                  });
                } else run(() => schedulePostAction(post.id), "Publish Queueに登録しました");
              }}
            >
              {busy && <Spinner />} {confirm === "now" ? "今すぐ投稿する" : "予約を確定する"}
            </button>
          </>
        }
      >
        <dl className="confirm-grid">
          <dt>アカウント</dt><dd>{s.account?.handle ?? "—"}</dd>
          <dt>プラットフォーム</dt><dd>{PLATFORM_LABELS[post.platform]}{s.format ? ` / ${PUBLISH_FORMAT_LABELS[s.format]}` : ""}</dd>
          <dt>店舗</dt><dd>{s.account?.locationName ?? "—"}</dd>
          <dt>投稿日時</dt><dd>{confirm === "now" ? "今すぐ" : `${formatInZone(post.scheduledAt, s.timezone)}（${s.timezone}）`}</dd>
          <dt>メディア</dt><dd>{s.media.length ? `${s.media.length}件` : "なし"}</dd>
          <dt>投稿内容</dt><dd className="confirm-text">{s.finalText}</dd>
        </dl>
        {s.account?.mock && <div className="field-hint">Demo Mode：モック投稿のため、実際のSNSには公開されません。</div>}
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 10 }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          投稿先（{s.account?.handle ?? "未選択"} / {s.account?.locationName ?? ""}）と内容を確認しました
        </label>
      </Modal>
    </section>
  );
}
