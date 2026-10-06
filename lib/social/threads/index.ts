import "server-only";
import { REQUIRED_SCOPES, type MetaAppConfig } from "../config";
import type { FetchLike } from "../http";
import type { SocialProvider } from "../provider";
import { threadsAuthorizationUrl, threadsConnect, threadsRefresh } from "./auth";
import { threadsAccountInsights, threadsPostInsights } from "./insights";
import { threadsContainerStatus, threadsPublish } from "./publisher";
import { validateThreads } from "./rules";

export class ThreadsProvider implements SocialProvider {
  readonly platform = "threads" as const;
  readonly kind = "meta" as const;
  readonly scopes = REQUIRED_SCOPES.threads;

  constructor(
    private readonly app: MetaAppConfig,
    private readonly fetchImpl?: FetchLike,
  ) {}

  getAuthorizationUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    return threadsAuthorizationUrl(this.app, state, redirectUri);
  }
  connectAccount({ code, redirectUri }: { code: string; redirectUri: string }) {
    return threadsConnect(this.app, code, redirectUri, this.fetchImpl);
  }
  refreshConnection(token: Parameters<SocialProvider["refreshConnection"]>[0]) {
    return threadsRefresh(token, this.fetchImpl);
  }
  validateContent(input: Parameters<SocialProvider["validateContent"]>[0]) {
    return validateThreads(input);
  }
  publishPost(request: Parameters<SocialProvider["publishPost"]>[0]) {
    return threadsPublish(request, this.fetchImpl);
  }
  getPostStatus({ accessToken, containerId }: { accessToken: string; containerId: string }) {
    return threadsContainerStatus(accessToken, containerId, this.fetchImpl);
  }
  getPostInsights({ accessToken, providerPostId }: Parameters<SocialProvider["getPostInsights"]>[0]) {
    return threadsPostInsights(accessToken, providerPostId, this.fetchImpl);
  }
  getAccountInsights({ accessToken, externalAccountId, since, until }: Parameters<SocialProvider["getAccountInsights"]>[0]) {
    return threadsAccountInsights(accessToken, externalAccountId, since, until, this.fetchImpl);
  }
  async disconnectAccount(): Promise<void> {
    // No documented revoke endpoint; the uninstall callback covers user-side removal.
  }
}
