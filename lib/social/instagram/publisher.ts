import "server-only";
import { SocialApiError } from "../errors";
import type { FetchLike } from "../http";
import type { PublishOutcome, PublishRequest } from "../types";
import { instagramGraph } from "./client";

/**
 * Instagram Content Publishing (container flow):
 *   1. POST /{ig-user-id}/media            (image_url | media_type=REELS video_url | CAROUSEL children)
 *   2. GET  /{container-id}?fields=status_code   IN_PROGRESS | FINISHED | ERROR | EXPIRED | PUBLISHED
 *   3. POST /{ig-user-id}/media_publish creation_id=…
 * Video processing is asynchronous: if the container is still IN_PROGRESS we
 * return "processing" and the queue worker resumes on its next tick (no long
 * blocking waits inside serverless functions). Containers expire after 24h.
 */
export async function instagramPublish(req: PublishRequest, fetchImpl?: FetchLike): Promise<PublishOutcome> {
  const graph = instagramGraph(fetchImpl);
  const token = req.accessToken;
  const user = req.externalAccountId;
  let containerId = req.containerId;

  const created = !containerId;
  if (!containerId) {
    if (req.format === "IG_IMAGE") {
      const media = req.media[0];
      if (!media) throw new SocialApiError("invalid_content", "instagram: image missing");
      containerId = (await graph.post<{ id: string }>(`/${user}/media`, { image_url: media.url, caption: req.text, access_token: token }, "instagram.create_image")).id;
    } else if (req.format === "IG_REEL") {
      const media = req.media[0];
      if (!media) throw new SocialApiError("invalid_content", "instagram: video missing");
      containerId = (
        await graph.post<{ id: string }>(
          `/${user}/media`,
          { media_type: "REELS", video_url: media.url, caption: req.text, share_to_feed: "true", access_token: token },
          "instagram.create_reel",
        )
      ).id;
    } else if (req.format === "IG_CAROUSEL") {
      const children: string[] = [];
      for (const media of req.media) {
        const child = await graph.post<{ id: string }>(
          `/${user}/media`,
          { image_url: media.url, is_carousel_item: "true", access_token: token },
          "instagram.create_carousel_item",
        );
        children.push(child.id);
      }
      containerId = (
        await graph.post<{ id: string }>(
          `/${user}/media`,
          { media_type: "CAROUSEL", children: children.join(","), caption: req.text, access_token: token },
          "instagram.create_carousel",
        )
      ).id;
    } else {
      throw new SocialApiError("invalid_content", `instagram: unsupported format ${req.format}`);
    }
  }

  if (created) await req.onContainerCreated?.(containerId);
  const status = await instagramContainerStatus(token, containerId, fetchImpl);
  if (status.status === "IN_PROGRESS") return { state: "processing", containerId, response: { container_status: status.status } };
  if (status.status === "ERROR") throw new SocialApiError("media_processing", `instagram: container error ${status.detail ?? ""}`.trim());
  if (status.status === "EXPIRED") throw new SocialApiError("invalid_content", "instagram: container expired (not published within 24h)");
  if (status.status === "PUBLISHED") {
    // Published by an earlier attempt whose response was lost: recover instead of posting twice.
    const recent = await graph.get<{ data?: { id: string; permalink?: string; caption?: string }[] }>(
      `/${user}/media`,
      { fields: "id,permalink,caption,timestamp", limit: "5", access_token: token },
      "instagram.recover_published",
    );
    const match = recent.data?.find((m) => (m.caption ?? "").trim() === req.text.trim()) ?? recent.data?.[0];
    if (!match) throw new SocialApiError("unknown", "instagram: container published but media not found");
    return { state: "published", providerPostId: match.id, permalink: match.permalink ?? null, response: { recovered: true } };
  }

  const published = await graph.post<{ id: string }>(`/${user}/media_publish`, { creation_id: containerId, access_token: token }, "instagram.media_publish");
  let permalink: string | null = null;
  try {
    permalink = (await graph.get<{ permalink?: string }>(`/${published.id}`, { fields: "permalink", access_token: token }, "instagram.permalink")).permalink ?? null;
  } catch {
    // permalink is cosmetic; the post is published either way
  }
  return { state: "published", providerPostId: published.id, permalink, response: { media_id: published.id, container_id: containerId } };
}

export async function instagramContainerStatus(token: string, containerId: string, fetchImpl?: FetchLike): Promise<{ status: string; detail: string | null }> {
  const res = await instagramGraph(fetchImpl).get<{ status_code?: string; status?: string }>(
    `/${containerId}`,
    { fields: "status_code,status", access_token: token },
    "instagram.container_status",
  );
  return { status: res.status_code ?? "IN_PROGRESS", detail: res.status ?? null };
}
