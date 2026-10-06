import "server-only";
import type { AppContext } from "@/lib/auth/context";
import type { AccountGoal, ID, SnsAccount } from "@/lib/domain/types";
import { EMPTY_STRATEGY } from "@/lib/data/repository";
import { assertCanManageConnection, getSocialContext, type SocialContext } from "./access";
import { getAppUrl } from "./config";
import { SocialApiError } from "./errors";
import { createOAuthState, verifyOAuthState } from "./oauth-state";
import { getSocialProvider, redirectUriFor } from "./registry";
import { SocialStoreError, type SocialStore } from "./store";
import type { AccountCandidate, PublishablePlatform } from "./types";

/**
 * OAuth flow:
 *   Connect → Meta authorization → callback (state check, code → long-lived
 *   token, profile) → pending connection (encrypted, 15 min) → user picks the
 *   target account / location → credentials saved server-side → connected.
 * Tokens never leave the server: the selection screen only sees candidates.
 */
export async function startConnect(app: AppContext, platform: PublishablePlatform, accountId: ID | null): Promise<{ url: string; cookie: string }> {
  const ctx = await getSocialContext(app);
  let account: SnsAccount | null = null;
  if (accountId) {
    account = (await app.repo.listAccounts(ctx.organizationId)).find((a) => a.id === accountId) ?? null;
    if (!account) throw new SocialStoreError("account not found", "not_found");
    if (account.platform !== platform) throw new SocialStoreError("platform mismatch", "conflict");
  }
  assertCanManageConnection(ctx, account);
  const provider = getSocialProvider(platform, { isDemoOrganization: ctx.isDemo });
  const { state, cookie } = createOAuthState({ userId: ctx.userId, organizationId: ctx.organizationId, platform, accountId });
  const url = provider.getAuthorizationUrl({ state, redirectUri: redirectUriFor(platform, ctx.isDemo, getAppUrl()) });
  return { url, cookie };
}

export type CallbackResult =
  | { ok: true; pendingId: ID; accountId: ID | null }
  | { ok: false; reason: "denied" | "state" | "org_changed" | "provider" | "forbidden"; message: string };

export async function handleCallback(
  app: AppContext,
  platform: PublishablePlatform,
  params: { code: string | null; state: string | null; error: string | null },
  cookie: string | undefined,
): Promise<CallbackResult> {
  const check = verifyOAuthState({ cookie, state: params.state, userId: app.user.id, platform });
  if (!check.ok) return { ok: false, reason: "state", message: "接続リクエストの有効期限が切れたか、不正なリクエストです。もう一度「接続」からやり直してください。" };
  if (params.error || !params.code) return { ok: false, reason: "denied", message: "連携がキャンセルされました。必要な権限を許可すると投稿・分析が利用できます。" };
  const ctx = await getSocialContext(app);
  if (check.data.organizationId !== ctx.organizationId) {
    return { ok: false, reason: "org_changed", message: "接続中にワークスペースが切り替わりました。もう一度お試しください。" };
  }
  let writer: SocialStore;
  try {
    writer = assertCanManageConnection(ctx, null);
  } catch (error) {
    return { ok: false, reason: "forbidden", message: (error as Error).message };
  }
  const provider = getSocialProvider(platform, { isDemoOrganization: ctx.isDemo });
  try {
    const result = await provider.connectAccount({ code: params.code, redirectUri: redirectUriFor(platform, ctx.isDemo, getAppUrl()) });
    const pendingId = await writer.createPending({ organizationId: ctx.organizationId, userId: ctx.userId, provider: platform, candidates: result.candidates, token: result.token });
    return { ok: true, pendingId, accountId: check.data.accountId };
  } catch (error) {
    const message = error instanceof SocialApiError ? error.userMessage : "SNSとの接続に失敗しました。時間をおいて再度お試しください。";
    if (error instanceof SocialApiError) console.error("[social] connect failed", error.message);
    return { ok: false, reason: "provider", message };
  }
}

/** Candidates for the selection screen (public profile data only). */
export async function getPendingCandidates(app: AppContext, pendingId: ID): Promise<{ platform: PublishablePlatform; candidates: AccountCandidate[] } | null> {
  const ctx = await getSocialContext(app);
  if (!ctx.writer) return null;
  const pending = await ctx.writer.getPending(pendingId, ctx.organizationId, ctx.userId);
  return pending ? { platform: pending.provider, candidates: pending.candidates } : null;
}

export type ConnectTarget =
  | { mode: "existing"; accountId: ID }
  | { mode: "new"; locationId: ID | null; goal: AccountGoal; displayName: string };

export async function completeConnection(app: AppContext, input: { pendingId: ID; externalAccountId: string; target: ConnectTarget }): Promise<SnsAccount> {
  const ctx = await getSocialContext(app);
  const accounts = await app.repo.listAccounts(ctx.organizationId);
  const targetAccount = input.target.mode === "existing" ? (accounts.find((a) => a.id === (input.target as { accountId: ID }).accountId) ?? null) : null;
  if (input.target.mode === "existing" && !targetAccount) throw new SocialStoreError("account not found", "not_found");
  const writer = assertCanManageConnection(ctx, targetAccount ?? { locationId: input.target.mode === "new" ? input.target.locationId : null });

  const pending = await writer.getPending(input.pendingId, ctx.organizationId, ctx.userId);
  if (!pending) throw new SocialStoreError("接続情報の有効期限（15分）が切れました。もう一度接続してください。", "not_found");
  const candidate = pending.candidates.find((c) => c.externalAccountId === input.externalAccountId);
  if (!candidate) throw new SocialStoreError("選択したアカウントが見つかりません", "not_found");
  if (targetAccount && targetAccount.platform !== pending.provider) throw new SocialStoreError("プラットフォームが一致しません", "conflict");

  const duplicate = await writer.findAccountIdByExternalId(ctx.organizationId, pending.provider, candidate.externalAccountId);
  if (duplicate && duplicate !== targetAccount?.id) {
    const other = accounts.find((a) => a.id === duplicate);
    throw new SocialStoreError(`このSNSアカウントは既に「${other?.handle ?? "別のアカウント"}」として接続されています。`, "conflict");
  }

  let account = targetAccount;
  if (!account && input.target.mode === "new") {
    account = await app.repo.saveAccount(ctx.organizationId, null, {
      platform: pending.provider,
      handle: `@${candidate.username}`,
      displayName: input.target.displayName || candidate.displayName,
      locationId: input.target.locationId,
      goal: input.target.goal,
      customGoal: "",
      active: true,
      strategy: structuredClone({ ...EMPTY_STRATEGY, kpiTargets: [], contentPillars: [], preferredPostingDays: [], preferredPostingTimes: [] }),
    });
  }
  if (!account) throw new SocialStoreError("account not resolved", "unknown");

  await writer.saveCredential(ctx.organizationId, account.id, pending.provider, candidate.externalAccountId, pending.token);
  await writer.updateConnection(ctx.organizationId, account.id, {
    status: "connected",
    externalAccountId: candidate.externalAccountId,
    username: candidate.username,
    profileImageUrl: candidate.profileImageUrl,
    tokenExpiresAt: pending.token.expiresAt,
    scopes: pending.token.scopes,
    connectedAt: new Date().toISOString(),
    error: null,
    metadata: candidate.metadata,
    handle: `@${candidate.username}`,
    connectedBy: ctx.userId,
  });
  await writer.consumePending(pending.id);
  await writer.logEvent(ctx.organizationId, {
    type: "account_connected",
    message: `${pending.provider === "instagram" ? "Instagram" : "Threads"} @${candidate.username} を接続しました`,
    socialAccountId: account.id,
    locationId: account.locationId,
    actorUserId: ctx.userId,
    details: { provider: pending.provider, scopes: pending.token.scopes.join(",") },
  });
  return { ...account, handle: `@${candidate.username}` };
}

export async function disconnectAccount(app: AppContext, accountId: ID): Promise<void> {
  const ctx = await getSocialContext(app);
  const account = (await app.repo.listAccounts(ctx.organizationId)).find((a) => a.id === accountId);
  if (!account) throw new SocialStoreError("account not found", "not_found");
  const writer = assertCanManageConnection(ctx, account);
  await disconnectWithStore(ctx, writer, account, "ユーザーが接続を解除しました");
}

export async function disconnectWithStore(ctx: Pick<SocialContext, "organizationId" | "userId" | "isDemo">, writer: SocialStore, account: Pick<SnsAccount, "id" | "platform" | "locationId" | "handle">, reason: string): Promise<void> {
  const credential = await writer.getCredential(ctx.organizationId, account.id);
  if (credential && (account.platform === "instagram" || account.platform === "threads")) {
    try {
      await getSocialProvider(account.platform, { isDemoOrganization: ctx.isDemo }).disconnectAccount({ accessToken: credential.token.accessToken });
    } catch {
      // best effort
    }
  }
  await writer.deleteCredential(ctx.organizationId, account.id);
  await writer.updateConnection(ctx.organizationId, account.id, { status: "disconnected", tokenExpiresAt: null, scopes: [], error: null });
  // Nothing may be published to an account we no longer hold a token for.
  const active = (await writer.listJobs(ctx.organizationId, { statuses: ["queued", "retrying", "publishing"] })).filter((j) => j.socialAccountId === account.id);
  for (const job of active) {
    await writer.updateJob(ctx.organizationId, job.id, { status: "cancelled", lastError: "アカウント接続解除のため予約を取り消しました" });
    await writer.updatePostPublishing(ctx.organizationId, job.postId, { status: "approved", error: "アカウント接続解除のため予約を取り消しました。再接続後に再度予約してください。" });
  }
  await writer.logEvent(ctx.organizationId, {
    type: "account_disconnected",
    level: "warn",
    message: `${account.handle} の接続を解除しました（${reason}）`,
    socialAccountId: account.id,
    locationId: account.locationId,
    actorUserId: ctx.userId,
    details: { cancelledJobs: active.length },
  });
}

/**
 * Long-lived tokens last 60 days and can be refreshed once ≥24h old. The
 * worker refreshes tokens that expire within 7 days; failures mark the account
 * as reauthorization_required (shown as "Reconnect Required").
 */
export async function refreshExpiringTokens(store: SocialStore, now: Date = new Date()): Promise<{ refreshed: number; failed: number }> {
  const horizon = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const expiring = await store.systemListCredentialsExpiringBefore(horizon);
  let refreshed = 0;
  let failed = 0;
  for (const item of expiring) {
    const credential = await store.getCredential(item.organizationId, item.socialAccountId);
    if (!credential) continue;
    const issued = new Date(credential.lastRefreshedAt ?? credential.createdAt).getTime();
    const expired = credential.token.expiresAt !== null && new Date(credential.token.expiresAt).getTime() <= now.getTime();
    if (!expired && now.getTime() - issued < 24 * 3_600_000) continue;
    const meta = await store.getOrganizationMeta(item.organizationId);
    try {
      if (expired) throw new SocialApiError("token_expired", "token already expired");
      const provider = getSocialProvider(item.provider, { isDemoOrganization: meta?.isDemo ?? false });
      const token = await provider.refreshConnection(credential.token);
      await store.saveCredential(item.organizationId, item.socialAccountId, item.provider, credential.externalAccountId, token);
      await store.updateConnection(item.organizationId, item.socialAccountId, { status: "connected", tokenExpiresAt: token.expiresAt, error: null });
      await store.logEvent(item.organizationId, { type: "token_refreshed", message: "アクセストークンを更新しました", socialAccountId: item.socialAccountId });
      refreshed++;
    } catch (error) {
      failed++;
      const failures = await store.markRefreshFailure(item.organizationId, item.socialAccountId);
      const fatal = expired || (error instanceof SocialApiError && (error.kind === "token_expired" || error.kind === "permission")) || failures >= 3;
      if (fatal) {
        await store.updateConnection(item.organizationId, item.socialAccountId, { status: "reauthorization_required", error: "トークンの更新に失敗しました。再接続してください。" });
        await store.logEvent(item.organizationId, { type: "account_reauthorization_required", level: "error", message: "トークンを更新できませんでした。再接続が必要です。", socialAccountId: item.socialAccountId });
      } else {
        await store.logEvent(item.organizationId, { type: "token_refresh_failed", level: "warn", message: `トークン更新に失敗しました（${failures}回目）。次回のジョブで再試行します。`, socialAccountId: item.socialAccountId });
      }
    }
  }
  return { refreshed, failed };
}
