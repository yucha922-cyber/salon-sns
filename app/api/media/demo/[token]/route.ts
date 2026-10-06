import { NextResponse, type NextRequest } from "next/server";
import { getDataMode } from "@/lib/env";
import { ACCEPTED_MIME, DEMO_MEDIA_MAX_BYTES, demoTokenData, getDemoBytes, putDemoBytes } from "@/lib/social/media";

export const dynamic = "force-dynamic";

/** Demo Mode media bytes (signed, expiring tokens; in-memory, per instance). */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (getDataMode() !== "demo") return NextResponse.json({ error: "not available" }, { status: 404 });
  const data = demoTokenData(decodeURIComponent((await params).token));
  if (!data || data.op !== "upload") return NextResponse.json({ error: "invalid token" }, { status: 403 });
  const type = request.headers.get("content-type") ?? "";
  if (!ACCEPTED_MIME[type]) return NextResponse.json({ error: "unsupported type" }, { status: 415 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > DEMO_MEDIA_MAX_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > DEMO_MEDIA_MAX_BYTES || bytes.byteLength === 0) return NextResponse.json({ error: "invalid size" }, { status: 413 });
  putDemoBytes(data.mediaId, bytes, type);
  return NextResponse.json({ ok: true });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (getDataMode() !== "demo") return NextResponse.json({ error: "not available" }, { status: 404 });
  const data = demoTokenData(decodeURIComponent((await params).token));
  if (!data || data.op !== "read") return NextResponse.json({ error: "invalid token" }, { status: 403 });
  const entry = getDemoBytes(data.mediaId);
  if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(Buffer.from(entry.bytes), { headers: { "Content-Type": entry.mimeType, "Cache-Control": "private, max-age=300" } });
}
