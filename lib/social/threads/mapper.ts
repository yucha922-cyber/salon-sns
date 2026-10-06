/** Threads ↔ common model mapping (pure). */
import { clean } from "../instagram/mapper";
import type { AccountCandidate, NormalizedMetrics } from "../types";

export interface ThreadsProfile {
  id: string;
  username?: string;
  name?: string;
  threads_profile_picture_url?: string;
  threads_biography?: string;
}

export function toThreadsCandidate(p: ThreadsProfile): AccountCandidate {
  return {
    externalAccountId: String(p.id),
    username: p.username ?? "",
    displayName: p.name ?? p.username ?? "",
    profileImageUrl: p.threads_profile_picture_url ?? null,
    metadata: {},
  };
}

export interface ThreadsInsightsResponse {
  data?: {
    name: string;
    values?: { value: number }[];
    total_value?: { value: number };
    link_total_values?: { value: number; link_url?: string }[];
  }[];
}

export function threadsInsightValues(res: ThreadsInsightsResponse): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of res.data ?? []) {
    if (typeof item.total_value?.value === "number") out[item.name] = item.total_value.value;
    else if (item.link_total_values) out[item.name] = item.link_total_values.reduce((n, v) => n + (v.value ?? 0), 0);
    else out[item.name] = (item.values ?? []).reduce((n, v) => n + (typeof v.value === "number" ? v.value : 0), 0);
  }
  return out;
}

const pick = (v: Record<string, number>, key: string) => (typeof v[key] === "number" ? v[key] : undefined);

/** Media: views, likes, replies, reposts, quotes, shares. Threads has no reach / saves. */
export function normalizeThreads(v: Record<string, number>): NormalizedMetrics {
  const platformSpecific: Record<string, number> = {};
  for (const key of ["reposts", "quotes"]) if (typeof v[key] === "number") platformSpecific[key] = v[key];
  const parts = ["likes", "replies", "reposts", "quotes", "shares"].map((k) => pick(v, k));
  const engagements = parts.every((x) => x === undefined) ? undefined : parts.reduce<number>((n, x) => n + (x ?? 0), 0);
  return clean({
    views: pick(v, "views"),
    likes: pick(v, "likes"),
    comments: pick(v, "replies"),
    shares: pick(v, "shares"),
    clicks: pick(v, "clicks"),
    followers: pick(v, "followers_count"),
    engagements,
    platformSpecific: Object.keys(platformSpecific).length ? platformSpecific : undefined,
  });
}
