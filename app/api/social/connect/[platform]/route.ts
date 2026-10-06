import { NextResponse, type NextRequest } from "next/server";
import { requireAppContext } from "@/lib/auth/context";
import { startConnect } from "@/lib/social/connections";
import { OAUTH_STATE_COOKIE, oauthStateCookieOptions } from "@/lib/social/oauth-state";
import { SocialApiError } from "@/lib/social/errors";
import { isPublishablePlatform } from "@/lib/social/types";
import { checkRateLimit, RATE_LIMITS, rateLimitMessage } from "@/lib/social/rate-limit";

export const dynamic = "force-dynamic";

/** Step 1: "Instagramを接続" / "Threadsを接続" → Meta authorization screen. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const back = new URL("/accounts", request.url);
  if (!isPublishablePlatform(platform as never)) return NextResponse.redirect(back);
  const app = await requireAppContext();
  const rl = checkRateLimit(`connect:${app.user.id}`, RATE_LIMITS.connect.limit, RATE_LIMITS.connect.windowMs);
  if (!rl.ok) {
    back.searchParams.set("social_error", rateLimitMessage(rl.retryAfterSeconds));
    return NextResponse.redirect(back);
  }
  const accountId = request.nextUrl.searchParams.get("account");
  try {
    const { url, cookie } = await startConnect(app, platform as "instagram" | "threads", accountId && /^[A-Za-z0-9-]{1,64}$/.test(accountId) ? accountId : null);
    const response = NextResponse.redirect(new URL(url, request.url));
    response.cookies.set(OAUTH_STATE_COOKIE, cookie, oauthStateCookieOptions);
    return response;
  } catch (error) {
    back.searchParams.set("social_error", error instanceof SocialApiError ? error.userMessage : error instanceof Error ? error.message : "接続を開始できませんでした");
    return NextResponse.redirect(back);
  }
}
