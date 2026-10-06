import { NextResponse, type NextRequest } from "next/server";
import { getCronSecret } from "@/lib/social/config";
import { safeEqual } from "@/lib/social/crypto";
import { runSocialTick, type TickTask } from "@/lib/social/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduler endpoint (publish queue + insights sync + token refresh).
 * Auth: "Authorization: Bearer <CRON_SECRET>" (Vercel Cron sends this
 * automatically when CRON_SECRET is set). Without CRON_SECRET it is disabled.
 */
async function handle(request: NextRequest) {
  const secret = getCronSecret();
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured" }, { status: 503 });
  const header = request.headers.get("authorization") ?? "";
  if (!safeEqual(header, `Bearer ${secret}`)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const taskParam = request.nextUrl.searchParams.get("task");
  const task: TickTask = taskParam === "publish" || taskParam === "insights" || taskParam === "tokens" ? taskParam : "all";
  try {
    const result = await runSocialTick({ task });
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    console.error("[cron] social tick failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "tick failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
