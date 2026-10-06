import { NextResponse, type NextRequest } from "next/server";
import { getSystemStore } from "@/lib/social/access";
import { getAppUrl } from "@/lib/social/config";
import { randomToken } from "@/lib/social/crypto";
import { parseSignedRequest } from "@/lib/social/signed-request";

export const dynamic = "force-dynamic";

/**
 * Meta "Data Deletion Request callback". Deletes the stored tokens for that
 * Meta user and returns { url, confirmation_code } as Meta requires.
 * (Published post records / metrics remain as the organization's own records;
 * see README for the deletion policy.)
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const parsed = parseSignedRequest(typeof form?.get("signed_request") === "string" ? (form?.get("signed_request") as string) : null);
  if (!parsed) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });
  const store = getSystemStore();
  if (!store) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const removed = await store.deleteCredentialsByExternalId(parsed.platform, parsed.userId);
  const code = randomToken(12);
  for (const r of removed) {
    await store.updateConnection(r.organizationId, r.socialAccountId, {
      status: "disconnected",
      externalAccountId: null,
      username: "",
      profileImageUrl: null,
      tokenExpiresAt: null,
      scopes: [],
      metadata: {},
      error: "データ削除リクエストにより連携情報を削除しました",
    });
    await store.logEvent(r.organizationId, { type: "account_disconnected", level: "warn", message: "Metaのデータ削除リクエストにより連携情報を削除しました", socialAccountId: r.socialAccountId, details: { confirmation: code } });
  }
  return NextResponse.json({ url: `${getAppUrl()}/social/data-deletion?code=${code}`, confirmation_code: code });
}
