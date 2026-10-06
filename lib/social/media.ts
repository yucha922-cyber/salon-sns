import "server-only";
import type { ID } from "@/lib/domain/types";
import { getDataMode } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "./config";
import { signPayload, verifyPayload } from "./crypto";
import type { MediaAsset, MediaKind, PublishMedia } from "./types";

/**
 * Media storage layer.
 *   Production: private Supabase Storage bucket "social-media".
 *     path: <organizationId>/<locationId|hq>/posts/<postId>/<assetId>.<ext>
 *     upload: server-issued signed upload URL (browser → Storage directly, so
 *             large videos never pass through our serverless functions)
 *     read:   short-lived signed URLs (preview: 10 min, Meta fetch: 6 h)
 *   Demo: bytes kept in memory (≤ 4 MB, per server instance) and served by
 *         /api/media/demo/<token> with a signed, expiring token.
 */
export const MEDIA_BUCKET = "social-media";
export const DEMO_MEDIA_MAX_BYTES = 4 * 1024 * 1024;
export const UPLOAD_MAX_BYTES = 1024 * 1024 * 1024;
export const ACCEPTED_MIME: Record<string, MediaKind> = {
  "image/jpeg": "image",
  "image/png": "image",
  "video/mp4": "video",
  "video/quicktime": "video",
};
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "video/mp4": "mp4", "video/quicktime": "mov" };

const g = globalThis as unknown as { __naoruDemoMedia?: Map<ID, { bytes: Uint8Array; mimeType: string }> };
const demoBytes = (g.__naoruDemoMedia ??= new Map());

export function storagePathFor(organizationId: ID, locationId: ID | null, postId: ID, assetId: ID, mimeType: string): string {
  return `${organizationId}/${locationId ?? "hq"}/posts/${postId}/${assetId}.${EXT[mimeType] ?? "bin"}`;
}

export interface UploadTarget {
  /** where the browser PUTs the file */
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

export async function createUploadTarget(asset: Pick<MediaAsset, "id" | "storagePath" | "mimeType">): Promise<UploadTarget> {
  if (getDataMode() === "demo") {
    const token = signPayload({ mediaId: asset.id, op: "upload" }, 10 * 60);
    return { url: `/api/media/demo/${encodeURIComponent(token)}`, method: "PUT", headers: { "Content-Type": asset.mimeType } };
  }
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("storage not configured");
  const { data, error } = await admin.storage.from(MEDIA_BUCKET).createSignedUploadUrl(asset.storagePath);
  if (error || !data) throw new Error(`signed upload url failed: ${error?.message ?? "unknown"}`);
  return { url: data.signedUrl, method: "PUT", headers: { "Content-Type": asset.mimeType, "x-upsert": "false" } };
}

/** Confirms the object exists and returns its real size (never trust the client's size). */
export async function verifyUploadedObject(asset: Pick<MediaAsset, "id" | "storagePath">): Promise<{ sizeBytes: number } | null> {
  if (getDataMode() === "demo") {
    const entry = demoBytes.get(asset.id);
    return entry ? { sizeBytes: entry.bytes.byteLength } : null;
  }
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const folder = asset.storagePath.split("/").slice(0, -1).join("/");
  const name = asset.storagePath.split("/").pop() ?? "";
  const { data, error } = await admin.storage.from(MEDIA_BUCKET).list(folder, { search: name, limit: 1 });
  if (error) return null;
  const object = data?.find((o) => o.name === name);
  const size = Number((object?.metadata as { size?: number } | undefined)?.size ?? 0);
  return object ? { sizeBytes: size } : null;
}

export async function signedReadUrl(asset: Pick<MediaAsset, "id" | "storagePath">, seconds: number): Promise<string | null> {
  if (getDataMode() === "demo") {
    if (!demoBytes.has(asset.id)) return null;
    return `/api/media/demo/${encodeURIComponent(signPayload({ mediaId: asset.id, op: "read" }, seconds))}`;
  }
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data } = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(asset.storagePath, seconds);
  return data?.signedUrl ?? null;
}

export async function deleteStoredObject(asset: Pick<MediaAsset, "id" | "storagePath">): Promise<void> {
  if (getDataMode() === "demo") {
    demoBytes.delete(asset.id);
    return;
  }
  await getSupabaseAdminClient()?.storage.from(MEDIA_BUCKET).remove([asset.storagePath]);
}

/** Media as handed to a provider: Meta fetches these URLs itself, so they must be absolute & public (signed). */
export async function toPublishMedia(assets: MediaAsset[]): Promise<PublishMedia[]> {
  const out: PublishMedia[] = [];
  for (const a of assets) {
    const url = await signedReadUrl(a, 6 * 3600);
    out.push({
      id: a.id,
      kind: a.kind,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      width: a.width,
      height: a.height,
      durationMs: a.durationMs,
      url: url ? (url.startsWith("http") ? url : `${getAppUrl()}${url}`) : "",
    });
  }
  return out;
}

// Demo byte store (used by the /api/media/demo route) -------------------------

export function demoTokenData(token: string): { mediaId: string; op: "upload" | "read" } | null {
  const data = verifyPayload<{ mediaId: string; op: "upload" | "read" }>(token);
  return data && typeof data.mediaId === "string" ? data : null;
}

export function putDemoBytes(mediaId: ID, bytes: Uint8Array, mimeType: string): void {
  demoBytes.set(mediaId, { bytes, mimeType });
}

export function getDemoBytes(mediaId: ID) {
  return demoBytes.get(mediaId) ?? null;
}
