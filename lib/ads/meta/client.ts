import "server-only";
import { GraphClient, type FetchLike } from "@/lib/social/http";
import { META_ADS_API } from "./config";

export function metaGraph(fetchImpl?: FetchLike): GraphClient {
  return new GraphClient({ baseUrl: `${META_ADS_API.graphBase}/${META_ADS_API.version}`, fetchImpl, timeoutMs: 30_000 });
}

/** Follows `paging.next` (cursor URLs) up to `maxPages`. */
export async function getAll<T>(graph: GraphClient, path: string, params: Record<string, string>, context: string, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  let res = await graph.get<{ data?: T[]; paging?: { next?: string } }>(path, params, context);
  out.push(...(res.data ?? []));
  for (let page = 1; res.paging?.next && page < maxPages; page++) {
    const next = new URL(res.paging.next);
    res = await graph.get<{ data?: T[]; paging?: { next?: string } }>(next.origin + next.pathname, Object.fromEntries(next.searchParams), context);
    out.push(...(res.data ?? []));
  }
  return out;
}
