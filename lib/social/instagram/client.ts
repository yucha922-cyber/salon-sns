import "server-only";
import { INSTAGRAM_API } from "../config";
import { GraphClient, type FetchLike } from "../http";

/** graph.instagram.com client (Instagram API with Instagram Login). */
export function instagramGraph(fetchImpl?: FetchLike): GraphClient {
  return new GraphClient({ baseUrl: `${INSTAGRAM_API.graphBase}/${INSTAGRAM_API.version}`, fetchImpl });
}

/** Unversioned host for token endpoints (access_token / refresh_access_token). */
export function instagramTokenHost(fetchImpl?: FetchLike): GraphClient {
  return new GraphClient({ baseUrl: INSTAGRAM_API.graphBase, fetchImpl });
}

/** api.instagram.com for the authorization-code exchange. */
export function instagramOAuthHost(fetchImpl?: FetchLike): GraphClient {
  return new GraphClient({ baseUrl: new URL(INSTAGRAM_API.tokenUrl).origin, fetchImpl });
}
