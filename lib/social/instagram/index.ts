import "server-only";
import { REQUIRED_SCOPES, type MetaAppConfig } from "../config";
import type { FetchLike } from "../http";
import type { SocialProvider } from "../provider";
import { instagramAuthorizationUrl, instagramConnect, instagramRefresh } from "./auth";
import { instagramAccountInsights, instagramPostInsights } from "./insights";
import { instagramContainerStatus, instagramPublish } from "./publisher";
import { validateInstagram } from "./rules";

export class InstagramProvider implements SocialProvider {
  readonly platform = "instagram" as const;
  readonly kind = "meta" as const;
  readonly scopes = REQUIRED_SCOPES.instagram;

  constructor(
    private readonly app: MetaAppConfig,
    private readonly fetchImpl?: FetchLike,
  ) {}

  getAuthorizationUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    return instagramAuthorizationUrl(this.app, state, redirectUri);
  }
  connectAccount({ code, redirectUri }: { code: string; redirectUri: string }) {
    return instagramConnect(this.app, code, redirectUri, this.fetchImpl);
  }
  refreshConnection(token: Parameters<SocialProvider["refreshConnection"]>[0]) {
    return instagramRefresh(token, this.fetchImpl);
  }
  validateContent(input: Parameters<SocialProvider["validateContent"]>[0]) {
    return validateInstagram(input);
  }
  publishPost(request: Parameters<SocialProvider["publishPost"]>[0]) {
    return instagramPublish(request, this.fetchImpl);
  }
  getPostStatus({ accessToken, containerId }: { accessToken: string; containerId: string }) {
    return instagramContainerStatus(accessToken, containerId, this.fetchImpl);
  }
  getPostInsights({ accessToken, providerPostId, format }: Parameters<SocialProvider["getPostInsights"]>[0]) {
    return instagramPostInsights(accessToken, providerPostId, format, this.fetchImpl);
  }
  getAccountInsights({ accessToken, externalAccountId, since, until }: Parameters<SocialProvider["getAccountInsights"]>[0]) {
    return instagramAccountInsights(accessToken, externalAccountId, since, until, this.fetchImpl);
  }
  async disconnectAccount(): Promise<void> {
    // Instagram Login has no token revoke endpoint for apps; users remove the app
    // in Instagram settings (we receive the deauthorize callback). Local
    // credentials are deleted by the caller.
  }
}
