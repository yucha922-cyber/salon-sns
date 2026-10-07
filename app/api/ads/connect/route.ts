import { NextResponse, type NextRequest } from "next/server";
import { requireAppContext } from "@/lib/auth/context";
import { ADS_STATE_COOKIE, adsCookieOptions, startAdsConnect } from "@/lib/ads/connect";
import { SocialApiError } from "@/lib/social/errors";
import { checkRateLimit, RATE_LIMITS, rateLimitMessage } from "@/lib/social/rate-limit";

export const dynamic = "force-dynamic";

/** Step 1: 「Meta広告アカウントを接続」 → Facebook Login for Business. */
export async function GET(request: NextRequest) {
  const back = new URL("/ads/connect", request.url);
  const app = await requireAppContext();
  const rl = checkRateLimit(`ads-connect:${app.user.id}`, RATE_LIMITS.connect.limit, RATE_LIMITS.connect.windowMs);
  if (!rl.ok) {
    back.searchParams.set("error", rateLimitMessage(rl.retryAfterSeconds));
    return NextResponse.redirect(back);
  }
  try {
    const { url, cookie } = await startAdsConnect(app);
    const response = NextResponse.redirect(new URL(url, request.url));
    response.cookies.set(ADS_STATE_COOKIE, cookie, adsCookieOptions(600));
    return response;
  } catch (error) {
    back.searchParams.set("error", error instanceof SocialApiError ? error.userMessage : error instanceof Error ? error.message : "接続を開始できませんでした");
    return NextResponse.redirect(back);
  }
}
