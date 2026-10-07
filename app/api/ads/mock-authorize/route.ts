import { NextResponse, type NextRequest } from "next/server";
import { requireAppContext } from "@/lib/auth/context";
import { adsProviderKind } from "@/lib/ads/meta/config";
import { MockAdsProvider } from "@/lib/ads/mock";

export const dynamic = "force-dynamic";

/** Demo-only stand-in for Meta's consent screen (redirects only to our own callback). */
export async function GET(request: NextRequest) {
  const app = await requireAppContext();
  if (adsProviderKind(app.current.organization.isDemo) !== "mock") return NextResponse.json({ error: "not available" }, { status: 404 });
  const q = request.nextUrl.searchParams;
  const redirect = new URL(q.get("redirect_uri") ?? "/", request.url);
  if (redirect.origin !== request.nextUrl.origin || redirect.pathname !== "/api/ads/callback") return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const target = new URL("/api/ads/callback", request.url);
  target.searchParams.set("state", q.get("state") ?? "");
  if (q.get("decision") === "deny") target.searchParams.set("error", "access_denied");
  else target.searchParams.set("code", MockAdsProvider.createCode());
  return NextResponse.redirect(target);
}
