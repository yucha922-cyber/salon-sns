import { NextResponse, type NextRequest } from "next/server";
import { getDataMode, getSupabasePublicConfig } from "@/lib/env";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

// Kept in sync with lib/auth/demo-session.ts (middleware can't import server-only modules).
const DEMO_SESSION_COOKIE = "naoru_demo_session";
// Machine endpoints authenticate themselves (cron secret, Meta signatures,
// signed media tokens) and must be reachable without a browser session.
const PUBLIC_PATHS = ["/login", "/signup", "/auth", "/api/cron", "/api/webhooks", "/api/social/meta", "/api/media/demo", "/social/data-deletion"];

/**
 * Route protection. Unauthenticated users are redirected to /login.
 * This is a fast first gate only — every page and server action verifies
 * the session again on the server (lib/auth/context.ts).
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const config = getDataMode() === "supabase" ? getSupabasePublicConfig() : null;
  let response = NextResponse.next({ request });
  let isAuthenticated: boolean;
  if (config) {
    ({ response, isAuthenticated } = await updateSupabaseSession(request, config));
  } else {
    isAuthenticated = Boolean(request.cookies.get(DEMO_SESSION_COOKIE)?.value);
  }

  if (!isAuthenticated && !isPublic) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if (isAuthenticated && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)"],
};
