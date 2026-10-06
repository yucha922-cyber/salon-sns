/** Instagram ↔ common model mapping (pure). */
import type { AccountCandidate, NormalizedMetrics } from "../types";

export interface IgProfile {
  id?: string;
  /** Instagram professional account id (use for /{ig-user-id}/media) */
  user_id?: string | number;
  username?: string;
  name?: string;
  account_type?: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
}

export function toCandidate(p: IgProfile): AccountCandidate {
  const externalAccountId = String(p.user_id ?? p.id ?? "");
  return {
    externalAccountId,
    username: p.username ?? "",
    displayName: p.name ?? p.username ?? "",
    profileImageUrl: p.profile_picture_url ?? null,
    metadata: {
      account_type: p.account_type ?? null,
      followers_count: typeof p.followers_count === "number" ? p.followers_count : null,
      media_count: typeof p.media_count === "number" ? p.media_count : null,
    },
  };
}

export interface GraphInsightsResponse {
  data?: {
    name: string;
    values?: { value: number | Record<string, number> }[];
    total_value?: { value: number };
  }[];
}

/** { metricName: number } from a Graph insights response (values[] summed, or total_value). */
export function insightValues(res: GraphInsightsResponse): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of res.data ?? []) {
    if (typeof item.total_value?.value === "number") {
      out[item.name] = item.total_value.value;
      continue;
    }
    const sum = (item.values ?? []).reduce((n, v) => n + (typeof v.value === "number" ? v.value : 0), 0);
    out[item.name] = sum;
  }
  return out;
}

const pick = (v: Record<string, number>, key: string) => (typeof v[key] === "number" ? v[key] : undefined);

/** Media insights (reach, views, likes, comments, shares, saved, total_interactions, follows, profile_visits, ig_reels_*). */
export function normalizeInstagramMedia(v: Record<string, number>): NormalizedMetrics {
  const platformSpecific: Record<string, number> = {};
  for (const key of ["ig_reels_avg_watch_time", "ig_reels_video_view_total_time", "profile_activity"]) {
    if (typeof v[key] === "number") platformSpecific[key] = v[key];
  }
  const likes = pick(v, "likes");
  const comments = pick(v, "comments");
  const shares = pick(v, "shares");
  const saves = pick(v, "saved");
  const derived = [likes, comments, shares, saves].every((x) => x === undefined) ? undefined : (likes ?? 0) + (comments ?? 0) + (shares ?? 0) + (saves ?? 0);
  return clean({
    reach: pick(v, "reach"),
    views: pick(v, "views"),
    likes,
    comments,
    shares,
    saves,
    engagements: pick(v, "total_interactions") ?? derived,
    follows: pick(v, "follows"),
    profileVisits: pick(v, "profile_visits"),
    platformSpecific: Object.keys(platformSpecific).length ? platformSpecific : undefined,
  });
}

/** Account insights (metric_type=total_value) + followers_count from the profile. */
export function normalizeInstagramAccount(v: Record<string, number>, followers: number | undefined): NormalizedMetrics {
  const platformSpecific: Record<string, number> = {};
  if (typeof v.accounts_engaged === "number") platformSpecific.accounts_engaged = v.accounts_engaged;
  if (typeof v.follows_and_unfollows === "number") platformSpecific.follows_and_unfollows = v.follows_and_unfollows;
  return clean({
    reach: pick(v, "reach"),
    views: pick(v, "views"),
    engagements: pick(v, "total_interactions"),
    clicks: pick(v, "profile_links_taps"),
    followers,
    platformSpecific: Object.keys(platformSpecific).length ? platformSpecific : undefined,
  });
}

export function clean(m: NormalizedMetrics): NormalizedMetrics {
  return Object.fromEntries(Object.entries(m).filter(([, value]) => value !== undefined)) as NormalizedMetrics;
}
