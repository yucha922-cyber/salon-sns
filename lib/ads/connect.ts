import "server-only";
import type { AppContext } from "@/lib/auth/context";
import type { ID } from "@/lib/domain/types";
import { decryptSecret, encryptSecret, randomToken, safeEqual } from "@/lib/social/crypto";
import { SocialApiError } from "@/lib/social/errors";
import { createHash } from "node:crypto";
import { assertCanOperateAds, getAdsContext, type AdsAccess } from "./access";
import { logAdsEvent } from "./events";
import type { ProviderAdAccount } from "./provider";
import { adsRedirectUri, getAdsProvider } from "./registry";
import { AdsStoreError } from "./store";
import { syncAdAccount } from "./sync";
import type { AdAccount } from "./types";

/**
 * Meta ad account connection:
 *   /api/ads/connect → Facebook Login for Business (state cookie) →
 *   /api/ads/callback (state check, code → long-lived token, /me/adaccounts) →
 *   pending selection (AES-256-GCM encrypted, httpOnly cookie, 15 min, bound
 *   to the user + organization) → /ads/connect: the admin picks accounts and
 *   (optionally) a location → ad_accounts + encrypted credential → first sync.
 * The access token never reaches the browser (the cookie is opaque ciphertext).
 */
export const ADS_STATE_COOKIE = "naoru_ads_oauth";
export const ADS_PENDING_COOKIE = "naoru_ads_pending";
const TTL = 15 * 60;

export const adsCookieOptions = (maxAge = TTL) => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge });

const hash = (s: string) => createHash("sha256").update(s).digest("base64url");

interface PendingPayload {
  userId: ID;
  organizationId: ID;
  exp: number;
  token: { accessToken: string; expiresAt: string | null; scopes: string[] };
  accounts: ProviderAdAccount[];
}

export async function startAdsConnect(app: AppContext): Promise<{ url: string; cookie: string }> {
  const ctx = await getAdsContext(app);
  assertCanOperateAds(ctx, null);
  const provider = getAdsProvider({ isDemoOrganization: ctx.isDemo });
  const state = randomToken(24);
  const cookie = encryptSecret(JSON.stringify({ stateHash: hash(state), userId: ctx.userId, organizationId: ctx.organizationId, exp: Math.floor(Date.now() / 1000) + 600 }));
  return { url: provider.getAuthorizationUrl({ state, redirectUri: adsRedirectUri(ctx.isDemo) }), cookie };
}

export async function handleAdsCallback(
  app: AppContext,
  params: { code: string | null; state: string | null; error: string | null },
  stateCookie: string | undefined,
): Promise<{ ok: true; pending: string } | { ok: false; message: string }> {
  let data: { stateHash: string; userId: string; organizationId: string; exp: number } | null = null;
  try {
    data = stateCookie ? JSON.parse(decryptSecret(stateCookie)) : null;
  } catch {
    data = null;
  }
  if (!data || !params.state || !safeEqual(data.stateHash, hash(params.state)) || data.exp < Date.now() / 1000 || data.userId !== app.user.id) {
    return { ok: false, message: "接続リクエストの有効期限が切れたか、不正なリクエストです。もう一度「広告アカウントを接続」からやり直してください。" };
  }
  if (params.error || !params.code) return { ok: false, message: "連携がキャンセルされました。ads_read / ads_management を許可すると分析・テストが利用できます。" };
  const ctx = await getAdsContext(app);
  if (data.organizationId !== ctx.organizationId) return { ok: false, message: "接続中にワークスペースが切り替わりました。もう一度お試しください。" };
  try {
    assertCanOperateAds(ctx, null);
    const provider = getAdsProvider({ isDemoOrganization: ctx.isDemo });
    const result = await provider.connect({ code: params.code, redirectUri: adsRedirectUri(ctx.isDemo) });
    if (!result.accounts.length) return { ok: false, message: "アクセスできる広告アカウントが見つかりませんでした。ビジネスマネージャで広告アカウントの権限を確認してください。" };
    const payload: PendingPayload = {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      exp: Math.floor(Date.now() / 1000) + TTL,
      token: { accessToken: result.accessToken, expiresAt: result.expiresAt, scopes: result.scopes },
      accounts: result.accounts.slice(0, 25),
    };
    return { ok: true, pending: encryptSecret(JSON.stringify(payload)) };
  } catch (error) {
    if (error instanceof SocialApiError) console.error("[ads] connect failed", error.message);
    return { ok: false, message: error instanceof SocialApiError ? error.userMessage : error instanceof AdsStoreError ? error.message : "Metaとの接続に失敗しました。時間をおいて再度お試しください。" };
  }
}

function readPending(ctx: AdsAccess, cookie: string | undefined): PendingPayload | null {
  if (!cookie) return null;
  try {
    const p = JSON.parse(decryptSecret(cookie)) as PendingPayload;
    if (p.exp < Date.now() / 1000 || p.userId !== ctx.userId || p.organizationId !== ctx.organizationId) return null;
    return p;
  } catch {
    return null;
  }
}

/** Account list for the selection screen (no token). */
export async function getPendingAdAccounts(app: AppContext, cookie: string | undefined): Promise<ProviderAdAccount[] | null> {
  const ctx = await getAdsContext(app);
  return readPending(ctx, cookie)?.accounts ?? null;
}

export async function completeAdsConnection(app: AppContext, cookie: string | undefined, selection: { externalAccountId: string; locationId: ID | null }[]): Promise<AdAccount[]> {
  const ctx = await getAdsContext(app);
  const pending = readPending(ctx, cookie);
  if (!pending) throw new AdsStoreError("接続の有効期限が切れました。もう一度接続してください。", "conflict");
  const out: AdAccount[] = [];
  for (const sel of selection) {
    const acc = pending.accounts.find((a) => a.externalAccountId === sel.externalAccountId);
    if (!acc) continue;
    if (sel.locationId && !app.brain.locations.some((l) => l.id === sel.locationId)) throw new AdsStoreError("店舗が見つかりません", "not_found");
    const writer = assertCanOperateAds(ctx, sel.locationId);
    const account = await writer.upsertAdAccount({
      organizationId: ctx.organizationId,
      brandId: null,
      locationId: sel.locationId,
      provider: "meta",
      businessId: acc.businessId,
      externalAccountId: acc.externalAccountId,
      name: acc.name,
      currency: acc.currency,
      timezone: acc.timezone,
      accountStatus: acc.accountStatus,
      connectionStatus: "connected",
      scopes: pending.token.scopes,
      tokenExpiresAt: pending.token.expiresAt,
      lastSyncedAt: null,
      connectionError: null,
      metadata: { business_name: acc.businessName },
    });
    await writer.saveAdCredential(ctx.organizationId, account.id, pending.token);
    await logAdsEvent(ctx.organizationId, { type: "ad_account_connected", message: `Meta広告アカウントを接続しました：${acc.name}（${acc.externalAccountId}）`, locationId: sel.locationId, details: { adAccountId: account.id }, actorUserId: ctx.userId });
    try {
      await syncAdAccount(writer, getAdsProvider({ isDemoOrganization: ctx.isDemo, account }), account, { actorUserId: ctx.userId });
    } catch (error) {
      console.error("[ads] initial sync failed", error instanceof Error ? error.message : error);
    }
    out.push(account);
  }
  return out;
}

export async function disconnectAdAccount(app: AppContext, adAccountId: ID): Promise<void> {
  const ctx = await getAdsContext(app);
  const account = (await ctx.reader.listAdAccounts(ctx.organizationId)).find((a) => a.id === adAccountId);
  if (!account) throw new AdsStoreError("広告アカウントが見つかりません", "not_found");
  const writer = assertCanOperateAds(ctx, account.locationId);
  await writer.deleteAdCredential(ctx.organizationId, account.id);
  await writer.updateAdAccount(ctx.organizationId, account.id, { connectionStatus: "disconnected", tokenExpiresAt: null });
  await logAdsEvent(ctx.organizationId, { type: "ad_account_disconnected", message: `Meta広告アカウントの接続を解除しました：${account.name}`, locationId: account.locationId, details: { adAccountId: account.id }, actorUserId: ctx.userId });
}

/** Manual "今すぐ同期" (editors may sync: read-only on Meta). */
export async function syncNow(app: AppContext, adAccountId: ID) {
  const ctx = await getAdsContext(app);
  const account = (await ctx.reader.listAdAccounts(ctx.organizationId)).find((a) => a.id === adAccountId);
  if (!account) throw new AdsStoreError("広告アカウントが見つかりません", "not_found");
  if (ctx.role === "viewer") throw new AdsStoreError("閲覧権限のため操作できません", "forbidden");
  if (!ctx.writer) throw new AdsStoreError("サーバー設定（SUPABASE_SERVICE_ROLE_KEY）がありません", "unavailable");
  return syncAdAccount(ctx.writer, getAdsProvider({ isDemoOrganization: ctx.isDemo, account }), account, { actorUserId: ctx.userId });
}
