import type { Post } from "./types";

/** Scheduled posts first (chronological), unscheduled drafts last (newest first). */
export function sortPosts(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => {
    if (a.scheduledAt && b.scheduledAt) return a.scheduledAt.localeCompare(b.scheduledAt);
    if (a.scheduledAt) return -1;
    if (b.scheduledAt) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function upcomingPosts(posts: Post[], now: Date = new Date(), limit = 3): Post[] {
  const nowIso = now.toISOString();
  return sortPosts(posts)
    .filter((p) => p.scheduledAt !== null && p.scheduledAt >= nowIso && p.status !== "published")
    .slice(0, limit);
}

/** An approved AI plan item whose caption has not been written yet. */
export function isPlannedOnly(post: Post): boolean {
  return Boolean(post.planning.planItemId) && !post.caption.trim();
}
