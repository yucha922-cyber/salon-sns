import { NextResponse, type NextRequest } from "next/server";
import { requireAppContext } from "@/lib/auth/context";
import { handleCallback } from "@/lib/social/connections";
import { OAUTH_STATE_COOKIE, oauthStateCookieOptions } from "@/lib/social/oauth-state";
import { isPublishablePlatform } from "@/lib/social/types";

export const dynamic = "force-dynamic";

/** Step 2: Meta redirects back here with ?code&state (or ?error). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const back = new URL("/accounts", request.url);
  if (!isPublishablePlatform(platform as never)) return NextResponse.redirect(back);
  const app = await requireAppContext();
  const q = request.nextUrl.searchParams;
  const result = await handleCallback(
    app,
    platform as "instagram" | "threads",
    { code: q.get("code"), state: q.get("state"), error: q.get("error") ?? q.get("error_reason") },
    request.cookies.get(OAUTH_STATE_COOKIE)?.value,
  );
  let response: NextResponse;
  if (result.ok) {
    const next = new URL("/accounts/connect", request.url);
    next.searchParams.set("pending", result.pendingId);
    if (result.accountId) next.searchParams.set("account", result.accountId);
    response = NextResponse.redirect(next);
  } else {
    back.searchParams.set("social_error", result.message);
    response = NextResponse.redirect(back);
  }
  // The state is single-use.
  response.cookies.set(OAUTH_STATE_COOKIE, "", { ...oauthStateCookieOptions, maxAge: 0 });
  return response;
}
