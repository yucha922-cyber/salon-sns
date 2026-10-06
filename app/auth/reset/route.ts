import { NextResponse, type NextRequest } from "next/server";
import { DEMO_SESSION_COOKIE } from "@/lib/auth/demo-session";
import { CURRENT_ORG_COOKIE } from "@/lib/auth/context";

/**
 * Clears a session that the middleware still sees but the server no longer
 * recognizes (e.g. demo data reset after a serverless cold start), then sends
 * the user to /login. Without this, /dashboard → /login → /dashboard loops.
 */
export async function GET(request: NextRequest) {
  const url = new URL("/login", request.url);
  url.searchParams.set("expired", "1");
  const response = NextResponse.redirect(url);
  response.cookies.delete(DEMO_SESSION_COOKIE);
  response.cookies.delete(CURRENT_ORG_COOKIE);
  // Supabase auth cookies (sb-*) are cleared too so a revoked session can't loop.
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-")) response.cookies.delete(cookie.name);
  }
  return response;
}
