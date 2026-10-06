import "server-only";
import { createHash } from "node:crypto";
import { REQUIRED_SCOPES } from "../config";
import { randomToken, signPayload, verifyPayload } from "../crypto";
import { SocialApiError, type SocialErrorKind } from "../errors";
import { clean } from "../instagram/mapper";
import { validateInstagram } from "../instagram/rules";
import type { SocialProvider } from "../provider";
import { validateThreads } from "../threads/rules";
import type {
  ConnectResult,
  InsightsResult,
  NormalizedMetrics,
  PublishFormat,
  PublishOutcome,
  PublishRequest,
  PublishablePlatform,
  TokenSet,
} from "../types";

/**
 * MockSocialProvider — used for Demo Mode / demo organizations / tests.
 * Never calls Meta. Same validation rules as the real providers, simulated
 * container processing for video, deterministic insights, and failure
 * injection for demos & tests:
 *   "[fail:rate_limit]" "[fail:token]" "[fail:invalid]" "[fail:media]"  → always fail
 *   "[fail-once:rate_limit]" …                                          → first attempt fails, retry succeeds
 */
const g = globalThis as unknown as { __naoruMockSocial?: { containers: Map<string, number>; failures: Map<string, number> } };
const state = (g.__naoruMockSocial ??= { containers: new Map(), failures: new Map() });

const hashNum = (s: string) => parseInt(createHash("sha1").update(s).digest("hex").slice(0, 8), 16);

/** 0..3 — how "educational / save-worthy" the text is (drives mock metrics). */
export function mockQualityScore(text: string): number {
  const keywords = [/how\s*-?to|ハウツー|やり方|方法/i, /セルフケア|ストレッチ|姿勢/, /NG|習慣|チェック|3選|5選/];
  return keywords.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
}

export function mockProviderPostId(platform: PublishablePlatform, publishedAt: Date, text: string): string {
  return `mock_${platform === "instagram" ? "ig" : "th"}_${publishedAt.getTime()}_${mockQualityScore(text)}_${hashNum(text + publishedAt.toISOString()).toString(36)}`;
}

/** Deterministic, monotonically growing metrics for a mock post. */
export function mockPostMetrics(providerPostId: string, format: PublishFormat, now: Date = new Date()): { metrics: NormalizedMetrics; raw: Record<string, number> } {
  const [, kind, ts, quality] = providerPostId.split("_");
  const published = Number(ts) || now.getTime();
  const hours = Math.max(0.5, (now.getTime() - published) / 3_600_000);
  const growth = Math.min(1, Math.log10(1 + hours) / Math.log10(1 + 24 * 7));
  const seed = hashNum(providerPostId);
  const q = Number(quality) || 0;
  const reel = format === "IG_REEL" || format === "THREADS_VIDEO";
  const base = (kind === "ig" ? 1400 : 650) * (reel ? 1.8 : 1) * (0.75 + (seed % 50) / 100) * (1 + q * 0.18);
  const reach = Math.round(base * growth);
  const views = Math.round(reach * (reel ? 2.3 : 1.5));
  const likes = Math.round(reach * (0.045 + (seed % 7) / 1000));
  const comments = Math.round(reach * 0.004 + (seed % 3));
  const shares = Math.round(reach * (0.006 + q * 0.002));
  const saves = Math.round(reach * (0.012 + q * 0.011));
  if (kind === "th") {
    const reposts = Math.round(views * 0.004);
    const quotes = Math.round(views * 0.001);
    const raw = { views, likes, replies: comments, reposts, quotes, shares };
    return {
      raw,
      metrics: clean({ views, likes, comments, shares, engagements: likes + comments + reposts + quotes + shares, platformSpecific: { reposts, quotes } }),
    };
  }
  const follows = Math.round(reach * 0.0025 * (1 + q * 0.3));
  const profileVisits = Math.round(reach * (0.03 + q * 0.006));
  const raw: Record<string, number> = { reach, views, likes, comments, shares, saved: saves, total_interactions: likes + comments + shares + saves, follows, profile_visits: profileVisits };
  if (reel) raw.ig_reels_avg_watch_time = 6000 + (seed % 5000);
  return {
    raw,
    metrics: clean({
      reach,
      views,
      likes,
      comments,
      shares,
      saves,
      engagements: likes + comments + shares + saves,
      follows,
      profileVisits,
      platformSpecific: reel ? { ig_reels_avg_watch_time: raw.ig_reels_avg_watch_time as number } : undefined,
    }),
  };
}

export function mockAccountMetrics(platform: PublishablePlatform, externalAccountId: string, now: Date = new Date()): NormalizedMetrics {
  const seed = hashNum(externalAccountId);
  const days = Math.floor(now.getTime() / 86_400_000);
  const followers = 800 + (seed % 2400) + (days % 365) * (2 + (seed % 4));
  if (platform === "threads") return clean({ views: 4000 + (seed % 3000), likes: 260 + (seed % 90), comments: 30 + (seed % 20), clicks: 40 + (seed % 30), followers });
  return clean({ reach: 9000 + (seed % 6000), views: 21000 + (seed % 9000), engagements: 900 + (seed % 400), clicks: 120 + (seed % 80), followers });
}

const FAIL_RE = /\[(fail|fail-once):(rate_limit|token|invalid|media|permission)\]/;
const FAIL_KIND: Record<string, SocialErrorKind> = {
  rate_limit: "rate_limited",
  token: "token_expired",
  invalid: "invalid_content",
  media: "media_processing",
  permission: "permission",
};

export class MockSocialProvider implements SocialProvider {
  readonly kind = "mock" as const;
  readonly scopes: string[];

  constructor(
    readonly platform: PublishablePlatform,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.scopes = REQUIRED_SCOPES[platform];
  }

  getAuthorizationUrl({ state: oauthState, redirectUri }: { state: string; redirectUri: string }): string {
    const params = new URLSearchParams({ platform: this.platform, state: oauthState, redirect_uri: redirectUri });
    return `/social/mock-authorize?${params.toString()}`;
  }

  /** Code minted by the mock consent screen (signed, 10 min). */
  static createCode(platform: PublishablePlatform, username: string): string {
    return signPayload({ platform, username }, 600);
  }

  async connectAccount({ code }: { code: string; redirectUri: string }): Promise<ConnectResult> {
    const data = verifyPayload<{ platform: string; username: string }>(code);
    if (!data || data.platform !== this.platform) throw new SocialApiError("permission", "mock: invalid authorization code");
    const username = data.username.replace(/^@/, "").replace(/[^A-Za-z0-9._]/g, "").slice(0, 30) || "naoru_new_store";
    return {
      token: { accessToken: `mock_${randomToken(18)}`, expiresAt: new Date(this.now().getTime() + 60 * 86_400_000).toISOString(), scopes: this.scopes },
      candidates: [
        {
          externalAccountId: `mock_${this.platform}_${hashNum(username)}`,
          username,
          displayName: username,
          profileImageUrl: null,
          metadata: this.platform === "instagram" ? { account_type: "BUSINESS", followers_count: 120 + (hashNum(username) % 900) } : {},
        },
      ],
    };
  }

  async refreshConnection(token: TokenSet): Promise<TokenSet> {
    if (token.accessToken.includes("revoked")) throw new SocialApiError("token_expired", "mock: token revoked");
    return { ...token, expiresAt: new Date(this.now().getTime() + 60 * 86_400_000).toISOString() };
  }

  validateContent(input: Parameters<SocialProvider["validateContent"]>[0]) {
    return this.platform === "instagram" ? validateInstagram(input) : validateThreads(input);
  }

  async publishPost(req: PublishRequest): Promise<PublishOutcome> {
    const fail = FAIL_RE.exec(req.text);
    if (fail) {
      const key = `${req.externalAccountId}:${req.text}`;
      const seen = state.failures.get(key) ?? 0;
      state.failures.set(key, seen + 1);
      if (fail[1] === "fail" || seen === 0) {
        throw new SocialApiError(FAIL_KIND[fail[2] as string] ?? "unknown", `mock: injected ${fail[2]} failure`, { retryAfterSeconds: 60 });
      }
    }
    if (req.accessToken.includes("revoked")) throw new SocialApiError("token_expired", "mock: token revoked");
    const video = req.format === "IG_REEL" || req.format === "THREADS_VIDEO";
    const containerId = req.containerId ?? `mockc_${randomToken(9)}`;
    if (!req.containerId) await req.onContainerCreated?.(containerId);
    if (video && !req.containerId) {
      state.containers.set(containerId, 1);
      return { state: "processing", containerId, response: { container_status: "IN_PROGRESS", mock: true } };
    }
    const now = this.now();
    const providerPostId = mockProviderPostId(this.platform, now, req.text);
    const permalink = this.platform === "instagram" ? `https://www.instagram.com/p/${providerPostId.slice(-10)}/` : `https://www.threads.com/@demo/post/${providerPostId.slice(-10)}`;
    state.containers.delete(containerId);
    return { state: "published", providerPostId, permalink, response: { media_id: providerPostId, container_id: containerId, mock: true } };
  }

  async getPostStatus({ containerId }: { accessToken: string; containerId: string }) {
    return { status: state.containers.has(containerId) ? "IN_PROGRESS" : "FINISHED", detail: null };
  }

  async getPostInsights({ providerPostId, format }: { accessToken: string; providerPostId: string; format: PublishFormat }): Promise<InsightsResult> {
    const { metrics, raw } = mockPostMetrics(providerPostId, format, this.now());
    return { metrics, raw: { ...raw, mock: 1 } };
  }

  async getAccountInsights({ externalAccountId }: { accessToken: string; externalAccountId: string; since: Date; until: Date }): Promise<InsightsResult> {
    const metrics = mockAccountMetrics(this.platform, externalAccountId, this.now());
    return { metrics, raw: { mock: 1 } };
  }

  async disconnectAccount(): Promise<void> {}
}
