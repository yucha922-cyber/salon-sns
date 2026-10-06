import { NextResponse, type NextRequest } from "next/server";
import { getWebhookVerifyToken } from "@/lib/social/config";
import { safeEqual } from "@/lib/social/crypto";
import { verifyWebhookSignature } from "@/lib/social/signed-request";

export const dynamic = "force-dynamic";

/**
 * Meta Webhooks (Instagram: comments / mentions / story_insights …; Threads:
 * replies / mentions). There is no "media published" or insights webhook,
 * so publishing & insights rely on the queue + polling. Here we only
 * verify and acknowledge (fast 200); handling comments/mentions is future work.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const token = getWebhookVerifyToken();
  if (q.get("hub.mode") === "subscribe" && token && safeEqual(q.get("hub.verify_token") ?? "", token)) {
    return new NextResponse(q.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  const platform = verifyWebhookSignature(raw, request.headers.get("x-hub-signature-256"));
  if (!platform) return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  try {
    const body = JSON.parse(raw) as { object?: string; entry?: { id?: string; changes?: { field?: string }[] }[] };
    const fields = (body.entry ?? []).flatMap((e) => (e.changes ?? []).map((c) => c.field ?? "?"));
    console.info(`[webhook] ${platform} ${body.object ?? ""} entries=${body.entry?.length ?? 0} fields=${[...new Set(fields)].join(",")}`);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
