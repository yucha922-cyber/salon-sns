import type { Post } from "@/lib/domain/types";
import { CONTENT_TYPE_LABELS, PLATFORM_ICONS, PLATFORM_LABELS, POST_STATUS_LABELS, POST_STATUS_PILL } from "@/lib/domain/labels";

const THUMB = ["", "peach", "blue"];

export function formatSchedule(iso: string | null, withYear = false): string {
  if (!iso) return "日時未定";
  return new Intl.DateTimeFormat("ja-JP", {
    ...(withYear ? { year: "numeric" } : {}),
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(iso));
}

export function PostRow({ post, index }: { post: Post; index: number }) {
  const icon = PLATFORM_ICONS[post.platform];
  return (
    <div className="post-row">
      <div className={`post-thumb ${THUMB[index % 3]}`}>{icon}</div>
      <div className="row-main">
        <b>{post.title}</b>
        <small>
          <span className={`platform-dot ${post.platform === "threads" ? "threads" : post.platform === "tiktok" ? "tiktok" : ""}`}>{icon}</span>
          {PLATFORM_LABELS[post.platform]} · {CONTENT_TYPE_LABELS[post.contentType]} · {formatSchedule(post.scheduledAt)}
        </small>
      </div>
      <div className="row-meta">
        <span className={`status-pill ${POST_STATUS_PILL[post.status]}`}>{POST_STATUS_LABELS[post.status]}</span>
      </div>
    </div>
  );
}
