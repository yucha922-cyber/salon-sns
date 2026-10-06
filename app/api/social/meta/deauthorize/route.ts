import { NextResponse, type NextRequest } from "next/server";
import { getSystemStore } from "@/lib/social/access";
import { parseSignedRequest } from "@/lib/social/signed-request";

export const dynamic = "force-dynamic";

/**
 * Meta "Deauthorize / Uninstall callback": the user removed our app in
 * Instagram / Threads. Verified signed_request → delete tokens, mark accounts
 * disconnected (queued jobs then fail safely with "reconnect required").
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const parsed = parseSignedRequest(typeof form?.get("signed_request") === "string" ? (form?.get("signed_request") as string) : null);
  if (!parsed) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });
  const store = getSystemStore();
  if (!store) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const removed = await store.deleteCredentialsByExternalId(parsed.platform, parsed.userId);
  for (const r of removed) {
    await store.updateConnection(r.organizationId, r.socialAccountId, { status: "disconnected", tokenExpiresAt: null, scopes: [], error: "SNS側でアプリ連携が解除されました" });
    await store.logEvent(r.organizationId, { type: "account_disconnected", level: "warn", message: "SNS側でアプリ連携が解除されました（Deauthorize callback）", socialAccountId: r.socialAccountId });
  }
  return NextResponse.json({ ok: true });
}
