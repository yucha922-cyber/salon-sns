"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Post, PostStatus } from "@/lib/domain/types";
import { CONTENT_TYPE_LABELS, PLATFORM_LABELS, POST_STATUS_LABELS } from "@/lib/domain/labels";
import { POST_STATUSES } from "@/lib/domain/types";
import { updatePostAction } from "@/app/actions/posts";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/form";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  const [when, setWhen] = useState(toLocalInput(post.scheduledAt));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await updatePostAction({
        id: post.id,
        title,
        caption,
        status,
        scheduledAt: when ? new Date(when).toISOString() : null,
      });
      if (!result.ok) return setError(result.error);
      toast("投稿を更新しました");
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      title="投稿の詳細"
      intro={`${PLATFORM_LABELS[post.platform]} · ${CONTENT_TYPE_LABELS[post.contentType]}${post.source === "ai_post_creator" ? " · AI生成" : ""}`}
      onClose={onClose}
      actions={
        <>
          <button className="button" onClick={onClose}>キャンセル</button>
          <button className="button primary" onClick={save} disabled={pending || !title.trim()}>
            {pending && <Spinner />} 更新する
          </button>
        </>
      }
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      <Field label="タイトル" htmlFor="editTitle">
        <input id="editTitle" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="キャプション" htmlFor="editCaption">
        <textarea id="editCaption" className="textarea" value={caption} onChange={(e) => setCaption(e.target.value)} />
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
          <select id="editStatus" className="select" value={status} onChange={(e) => setStatus(e.target.value as PostStatus)}>
            {POST_STATUSES.map((s) => <option key={s} value={s}>{POST_STATUS_LABELS[s]}</option>)}
          </select>
        </Field>
        <Field label="投稿日時" htmlFor="editWhen">
          <input id="editWhen" className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      </div>
      <div className="field-hint">MVPではSNSへの自動投稿は行いません。「公開済み」は手動で投稿した後の記録用です。</div>
    </Modal>
  );
}
