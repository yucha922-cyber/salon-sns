import { NextResponse, type NextRequest } from "next/server";
import { runAdsTick } from "@/lib/ads/worker";
import { getCronSecret } from "@/lib/social/config";
import { safeEqual } from "@/lib/social/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily ad data sync + experiment refresh. Auth: "Authorization: Bearer <CRON_SECRET>". */
async function handle(request: NextRequest) {
  const secret = getCronSecret();
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured" }, { status: 503 });
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const result = await runAdsTick();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    console.error("[cron] ads tick failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "tick failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
