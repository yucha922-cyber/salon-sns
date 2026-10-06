import { NextResponse, type NextRequest } from "next/server";
import { requireAppContext } from "@/lib/auth/context";
import { socialProviderKind } from "@/lib/social/config";
import { MockSocialProvider } from "@/lib/social/mock";
import { isPublishablePlatform } from "@/lib/social/types";

export const dynamic = "force-dynamic";

/**
 * Demo-only stand-in for Meta's consent screen. Issues a signed mock code and
 * returns to OUR callback (redirect_uri is restricted to /api/social/callback/*
 * on this origin, so it can't be used as an open redirect).
 */
export async function GET(request: NextRequest) {
  const app = await requireAppContext();
  if (socialProviderKind(app.current.organization.isDemo) !== "mock") return NextResponse.json({ error: "not available" }, { status: 404 });
  const q = request.nextUrl.searchParams;
  const platform = q.get("platform") ?? "";
  const state = q.get("state") ?? "";
  const redirect = new URL(q.get("redirect_uri") ?? "/", request.url);
  if (!isPublishablePlatform(platform as never) || redirect.origin !== request.nextUrl.origin || redirect.pathname !== `/api/social/callback/${platform}`) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const target = new URL(redirect.pathname, request.url);
  target.searchParams.set("state", state);
  if (q.get("decision") === "deny") {
    target.searchParams.set("error", "access_denied");
  } else {
    target.searchParams.set("code", MockSocialProvider.createCode(platform as "instagram" | "threads", q.get("username") ?? "naoru_new_store"));
  }
  return NextResponse.redirect(target);
}
