import "server-only";
import { SocialApiError } from "../errors";
import type { FetchLike } from "../http";
import type { PublishOutcome, PublishRequest } from "../types";
import { threadsGraph } from "./client";

/**
 * Threads publishing (container flow):
 *   1. POST /{threads-user-id}/threads   media_type=TEXT|IMAGE|VIDEO, text, image_url|video_url
 *   2. GET  /{container-id}?fields=status,error_message   IN_PROGRESS|FINISHED|PUBLISHED|ERROR|EXPIRED
 *   3. POST /{threads-user-id}/threads_publish creation_id=…
 * Meta recommends waiting ~30s on average before publishing; we only publish
 * once the container reports FINISHED and otherwise resume on the next tick.
 */
export async function threadsPublish(req: PublishRequest, fetchImpl?: FetchLike): Promise<PublishOutcome> {
  const graph = threadsGraph(fetchImpl);
  const token = req.accessToken;
  const user = req.externalAccountId;
  let containerId = req.containerId;

  const created = !containerId;
  if (!containerId) {
    const media = req.media[0];
    const form: Record<string, string> = { text: req.text, access_token: token };
    if (req.format === "THREADS_TEXT") form.media_type = "TEXT";
    else if (req.format === "THREADS_IMAGE" && media) Object.assign(form, { media_type: "IMAGE", image_url: media.url });
    else if (req.format === "THREADS_VIDEO" && media) Object.assign(form, { media_type: "VIDEO", video_url: media.url });
    else throw new SocialApiError("invalid_content", `threads: unsupported format ${req.format}`);
    containerId = (await graph.post<{ id: string }>(`/${user}/threads`, form, "threads.create_container")).id;
  }

  if (created) await req.onContainerCreated?.(containerId);
  const status = await threadsContainerStatus(token, containerId, fetchImpl);
  if (status.status === "IN_PROGRESS") return { state: "processing", containerId, response: { container_status: status.status } };
  if (status.status === "ERROR") throw new SocialApiError("media_processing", `threads: container error ${status.detail ?? ""}`.trim());
  if (status.status === "EXPIRED") throw new SocialApiError("invalid_content", "threads: container expired");
  if (status.status === "PUBLISHED") {
    const recent = await graph.get<{ data?: { id: string; permalink?: string; text?: string }[] }>(
      `/${user}/threads`,
      { fields: "id,permalink,text,timestamp", limit: "5", access_token: token },
      "threads.recover_published",
    );
    const match = recent.data?.find((m) => (m.text ?? "").trim() === req.text.trim()) ?? recent.data?.[0];
    if (!match) throw new SocialApiError("unknown", "threads: container published but post not found");
    return { state: "published", providerPostId: match.id, permalink: match.permalink ?? null, response: { recovered: true } };
  }

  const published = await graph.post<{ id: string }>(`/${user}/threads_publish`, { creation_id: containerId, access_token: token }, "threads.publish");
  let permalink: string | null = null;
  try {
    permalink = (await graph.get<{ permalink?: string }>(`/${published.id}`, { fields: "permalink", access_token: token }, "threads.permalink")).permalink ?? null;
  } catch {
    // cosmetic
  }
  return { state: "published", providerPostId: published.id, permalink, response: { media_id: published.id, container_id: containerId } };
}

export async function threadsContainerStatus(token: string, containerId: string, fetchImpl?: FetchLike): Promise<{ status: string; detail: string | null }> {
  const res = await threadsGraph(fetchImpl).get<{ status?: string; error_message?: string }>(
    `/${containerId}`,
    { fields: "status,error_message", access_token: token },
    "threads.container_status",
  );
  return { status: res.status ?? "IN_PROGRESS", detail: res.error_message ?? null };
}
