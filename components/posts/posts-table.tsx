"use client";

import { useState } from "react";
import type { Post, PostStatus } from "@/lib/domain/types";
import { CONTENT_TYPE_LABELS, PLATFORM_LABELS, POST_STATUS_LABELS, POST_STATUS_PILL } from "@/lib/domain/labels";
import { POST_STATUSES } from "@/lib/domain/types";
import { EmptyState } from "@/components/ui/states";
import { PostEditModal } from "./post-edit-modal";
import { formatSchedule } from "./post-row";

export function PostsTable({ posts, accountLabels = {} }: { posts: Post[]; accountLabels?: Record<string, string> }) {
  const [filter, setFilter] = useState<PostStatus | "all">("all");
  const [editing, setEditing] = useState<Post | null>(null);
  const visible = filter === "all" ? posts : posts.filter((p) => p.status === filter);
  const count = (s: PostStatus) => posts.filter((p) => p.status === s).length;

  return (
    <div className="panel">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={filter === "all"} className={`tab ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
          すべて <span>{posts.length}</span>
        </button>
        {POST_STATUSES.map((s) => (
          <button role="tab" aria-selected={filter === s} key={s} className={`tab ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>
            {POST_STATUS_LABELS[s]} <span>{count(s)}</span>
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <EmptyState icon="▤" title={posts.length ? "該当する投稿はありません" : "まだ投稿がありません"}
          description="AI投稿作成でつくった投稿がここに一覧表示されます。" action={{ label: "AIで投稿を作成", href: "/creator" }} />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>投稿内容</th><th>アカウント</th><th>プラットフォーム</th><th>公開日時</th><th>ステータス</th><th>作成</th><th /></tr>
            </thead>
            <tbody>
              {visible.map((p, i) => (
                <tr key={p.id}>
                  <td><div className="campaign-name"><span className="table-marker">{i % 2 ? "◉" : "▤"}</span><b>{p.title}</b></div></td>
                  <td className="table-muted">{(p.accountId && accountLabels[p.accountId]) || "—"}</td>
                  <td className="table-muted">{PLATFORM_LABELS[p.platform]} · {CONTENT_TYPE_LABELS[p.contentType]}</td>
                  <td className="table-muted">{formatSchedule(p.scheduledAt, true)}</td>
                  <td><span className={`status-pill ${POST_STATUS_PILL[p.status]}`}>{POST_STATUS_LABELS[p.status]}</span></td>
                  <td className="table-muted">{p.source === "ai_post_creator" ? "AI生成" : p.source === "hq_localization" ? "本部ローカライズ" : p.source === "demo" ? "デモ" : "手動"}</td>
                  <td><button className="more-button" aria-label="投稿を編集" onClick={() => setEditing(p)}>···</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PostEditModal post={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
