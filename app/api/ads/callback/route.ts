import { NextResponse, type NextRequest } from "next/server";
import { requireAppContext } from "@/lib/auth/context";
import { ADS_PENDING_COOKIE, ADS_STATE_COOKIE, adsCookieOptions, handleAdsCallback } from "@/lib/ads/connect";

export const dynamic = "force-dynamic";

/** Step 2: Meta redirects back with ?code&state (or ?error). */
export async function GET(request: NextRequest) {
  const app = await requireAppContext();
  const q = request.nextUrl.searchParams;
  const result = await handleAdsCallback(app, { code: q.get("code"), state: q.get("state"), error: q.get("error") ?? q.get("error_reason") }, request.cookies.get(ADS_STATE_COOKIE)?.value);
  const next = new URL("/ads/connect", request.url);
  if (result.ok) next.searchParams.set("select", "1");
  else next.searchParams.set("error", result.message);
  const response = NextResponse.redirect(next);
  response.cookies.set(ADS_STATE_COOKIE, "", adsCookieOptions(0)); // single use
  if (result.ok) response.cookies.set(ADS_PENDING_COOKIE, result.pending, adsCookieOptions());
  return response;
}
