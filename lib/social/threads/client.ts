import "server-only";
import { THREADS_API } from "../config";
import { GraphClient, type FetchLike } from "../http";

/** graph.threads.com client (host & version configurable: THREADS_GRAPH_BASE_URL / _API_VERSION). */
export function threadsGraph(fetchImpl?: FetchLike): GraphClient {
  return new GraphClient({ baseUrl: `${THREADS_API.graphBase}/${THREADS_API.version}`, fetchImpl });
}

/** Unversioned host for token endpoints. */
export function threadsTokenHost(fetchImpl?: FetchLike): GraphClient {
  return new GraphClient({ baseUrl: THREADS_API.graphBase, fetchImpl });
}
