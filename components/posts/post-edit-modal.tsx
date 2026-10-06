"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import type { Post, PostStatus } from "@/lib/domain/types";
import { CONTENT_TYPE_LABELS, PLATFORM_LABELS, POST_STATUS_LABELS, POST_STATUS_PILL } from "@/lib/domain/labels";
import { EDITABLE_POST_STATUSES } from "@/lib/domain/types";
import { DEFAULT_TIMEZONE, isoToZonedLocal, zonedLocalToIso } from "@/lib/domain/timezone";
import { PublishPanel } from "@/components/social/publish-panel";
import { updatePostAction } from "@/app/actions/posts";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/form";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

// Scheduling input/display uses the organization timezone (Japan stores: Asia/Tokyo),
// independent of the browser's timezone. Stored values are UTC instants.
const TZ = DEFAULT_TIMEZONE;

export function PostEditModal({ post, onClose }: { post: Post | null; onClose: () => void }) {
  if (!post) return null;
  return <PostEditForm key={post.id} post={post} onClose={onClose} />;
}

function PostEditForm({ post, onClose }: { post: Post; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(post.title);
  const [caption, setCaption] = useState(post.caption);
  const [status, setStatus] = useState<PostStatus>(post.status);
  const [when, setWhen] = useState(isoToZonedLocal(post.scheduledAt, TZ));
  // Live status from the publish panel (approve / queue / publish happen inside this modal).
  const [liveStatus, setLiveStatus] = useState<PostStatus>(post.status);
  const onPanelStatus = useCallback((next: PostStatus) => {
    setLiveStatus(next);
    setStatus(next);
  }, []);
  const frozen = liveStatus === "queued" || liveStatus === "publishing";
  const statusEditable = (EDITABLE_POST_STATUSES as readonly string[]).includes(liveStatus);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await updatePostAction({
        id: post.id,
        title,
        caption,
        status,
        scheduledAt: when ? zonedLocalToIso(when, TZ) : null,
      });
      if (!result.ok) return setError(result.error);
      toast("投稿を更新しました");
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      wide
      title="投稿の詳細"
      intro={`${PLATFORM_LABELS[post.platform]} · ${CONTENT_TYPE_LABELS[post.contentType]}${post.source === "ai_post_creator" ? " · AI生成" : ""}`}
      onClose={onClose}
      actions={
        <>
          <button className="button" onClick={onClose}>キャンセル</button>
          <button className="button primary" onClick={save} disabled={pending || !title.trim() || frozen}>
            {pending && <Spinner />} 更新する
          </button>
        </>
      }
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      {frozen && <div className="recommendation-callout" style={{ marginBottom: 10 }}>予約投稿に登録済みのため編集できません。編集するには下の「予約を取り消す」を押してください。</div>}
      {liveStatus === "approved" && <div className="field-hint">※ 承認済みの内容を編集すると、承認は取り消されます（再承認が必要です）。</div>}
      <Field label="タイトル" htmlFor="editTitle">
        <input id="editTitle" className="input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={frozen} />
      </Field>
      <Field label="キャプション" htmlFor="editCaption">
        <textarea id="editCaption" className="textarea" value={caption} onChange={(e) => setCaption(e.target.value)} disabled={frozen} />
      </Field>
      {post.hashtags.length > 0 && <div className="field-hint hashtag-preview">{post.hashtags.join(" ")}</div>}
      {(post.planning.hook || post.planning.summary) && (
        <div className="recommendation-callout" style={{ marginBottom: 12 }}>
          <b>企画</b>{post.planning.funnelStage && <span className="stage-pill" style={{ marginLeft: 6 }}>{post.planning.funnelStage}</span>}<br />
          {post.planning.hook && <>フック：{post.planning.hook}<br /></>}
          {post.planning.summary}
          <div style={{ marginTop: 8 }}>
            <Link className="button small soft" href={`/creator?post=${post.id}`}>{post.caption.trim() ? "AIでキャプションを作り直す →" : "AIでキャプションを作成 →"}</Link>
          </div>
        </div>
      )}
      <div className="two-fields">
        <Field label="ステータス" htmlFor="editStatus">
          {statusEditable ? (
            <select id="editStatus" className="select" value={status} onChange={(e) => setStatus(e.target.value as PostStatus)}>
              {EDITABLE_POST_STATUSES.map((s) => <option key={s} value={s}>{POST_STATUS_LABELS[s]}</option>)}
            </select>
          ) : (
            <div style={{ minHeight: 35, display: "flex", alignItems: "center" }}><span className={`status-pill ${POST_STATUS_PILL[liveStatus]}`}>{POST_STATUS_LABELS[liveStatus]}</span></div>
          )}
        </Field>
        <Field label={`投稿日時（${TZ}）`} htmlFor="editWhen">
          <input id="editWhen" className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} disabled={frozen} />
        </Field>
      </div>
      <div className="field-hint">「公開済み」を手動で選ぶのは、SNSアプリから手動投稿した場合の記録用です。自動投稿は下の「SNSへの公開」から行います。</div>
      <PublishPanel post={post} readOnly={false} onStatusChange={onPanelStatus} />
    </Modal>
  );
}
