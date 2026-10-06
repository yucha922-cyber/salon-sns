import "server-only";
import type { FetchLike } from "../http";
import type { InsightsResult } from "../types";
import { threadsGraph } from "./client";
import { normalizeThreads, threadsInsightValues, type ThreadsInsightsResponse } from "./mapper";

/** Media insights: views, likes, replies, reposts, quotes, shares. */
export async function threadsPostInsights(token: string, mediaId: string, fetchImpl?: FetchLike): Promise<InsightsResult> {
  const res = await threadsGraph(fetchImpl).get<ThreadsInsightsResponse>(
    `/${mediaId}/insights`,
    { metric: "views,likes,replies,reposts,quotes,shares", access_token: token },
    "threads.media_insights",
  );
  const values = threadsInsightValues(res);
  return { metrics: normalizeThreads(values), raw: values };
}

/**
 * User insights. since/until do not work before 2024-04-13 (1712991600).
 * followers_count is unavailable for profiles without a linked Instagram
 * account, so it is requested separately and treated as optional.
 */
export async function threadsAccountInsights(token: string, userId: string, since: Date, until: Date, fetchImpl?: FetchLike): Promise<InsightsResult> {
  const graph = threadsGraph(fetchImpl);
  const range = {
    since: String(Math.max(1712991600, Math.floor(since.getTime() / 1000))),
    until: String(Math.floor(until.getTime() / 1000)),
  };
  const res = await graph.get<ThreadsInsightsResponse>(
    `/${userId}/threads_insights`,
    { metric: "views,likes,replies,reposts,quotes,clicks", ...range, access_token: token },
    "threads.account_insights",
  );
  const values = threadsInsightValues(res);
  try {
    const followers = await graph.get<ThreadsInsightsResponse>(
      `/${userId}/threads_insights`,
      { metric: "followers_count", access_token: token },
      "threads.followers",
    );
    Object.assign(values, threadsInsightValues(followers));
  } catch {
    // not available for this profile
  }
  return { metrics: normalizeThreads(values), raw: values };
}
