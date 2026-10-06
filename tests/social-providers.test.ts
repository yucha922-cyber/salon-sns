import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, signPayload, verifyPayload } from "@/lib/social/crypto";
import { createOAuthState, verifyOAuthState } from "@/lib/social/oauth-state";
import { fromGraphError, sanitize, SocialApiError } from "@/lib/social/errors";
import { validateInstagram } from "@/lib/social/instagram/rules";
import { validateThreads } from "@/lib/social/threads/rules";
import { InstagramProvider } from "@/lib/social/instagram";
import { ThreadsProvider } from "@/lib/social/threads";
import { normalizeInstagramMedia, insightValues } from "@/lib/social/instagram/mapper";
import { normalizeThreads, threadsInsightValues } from "@/lib/social/threads/mapper";
import { threadsLength } from "@/lib/social/text";
import { connectionBadge, emptyConnection } from "@/lib/social/connection";
import { parseSignedRequest, verifyWebhookSignature } from "@/lib/social/signed-request";
import { createHmac } from "node:crypto";
import type { ValidationInput } from "@/lib/social/types";

const app = { appId: "123", appSecret: "app-secret", redirectUri: "https://app.example.com/api/social/callback/instagram" };

/** Tiny fake Graph API: routes by "METHOD path", records every call. */
function fakeGraph(routes: Record<string, (body: URLSearchParams, url: URL) => { status?: number; json: unknown }>) {
  const calls: { method: string; url: URL; body: URLSearchParams }[] = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const method = init?.method ?? "GET";
    const body = new URLSearchParams(typeof init?.body === "string" ? init.body : "");
    calls.push({ method, url, body });
    const key = Object.keys(routes).find((k) => {
      const [m, p] = k.split(" ");
      return m === method && new RegExp(`${p}$`).test(url.origin + url.pathname);
    });
    if (!key) return new Response(JSON.stringify({ error: { message: `no route ${method} ${url.pathname}`, code: 100 } }), { status: 400 });
    const r = routes[key]!(body, url);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  };
  return { calls, fetchImpl };
}

const media = (patch: Partial<ValidationInput["media"][number]> = {}): ValidationInput["media"][number] => ({
  kind: "image",
  mimeType: "image/jpeg",
  sizeBytes: 500_000,
  width: 1080,
  height: 1350,
  durationMs: null,
  ...patch,
});

describe("token encryption & OAuth state (CSRF)", () => {
  it("encrypts tokens at rest and rejects tampering", () => {
    const c = encryptSecret("IGQVJ-secret-token");
    expect(c).not.toContain("secret-token");
    expect(decryptSecret(c)).toBe("IGQVJ-secret-token");
    const parts = c.split(":");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("signed payloads expire and cannot be forged", () => {
    const token = signPayload({ a: 1 }, 60);
    expect(verifyPayload<{ a: number }>(token)?.a).toBe(1);
    expect(verifyPayload(token.replace(/.$/, (ch) => (ch === "A" ? "B" : "A")))).toBeNull();
    expect(verifyPayload(signPayload({ a: 1 }, -1))).toBeNull();
  });

  it("accepts the callback only with the matching state, user and platform", () => {
    const { state, cookie } = createOAuthState({ userId: "u1", organizationId: "o1", platform: "instagram", accountId: null });
    expect(verifyOAuthState({ cookie, state, userId: "u1", platform: "instagram" })).toMatchObject({ ok: true, data: { organizationId: "o1" } });
    expect(verifyOAuthState({ cookie, state: "attacker-state", userId: "u1", platform: "instagram" })).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyOAuthState({ cookie, state, userId: "u2", platform: "instagram" })).toEqual({ ok: false, reason: "wrong_user" });
    expect(verifyOAuthState({ cookie, state, userId: "u1", platform: "threads" })).toEqual({ ok: false, reason: "wrong_platform" });
    expect(verifyOAuthState({ cookie: undefined, state, userId: "u1", platform: "instagram" })).toEqual({ ok: false, reason: "missing" });
  });
});

describe("content validation (tells the user how to fix it)", () => {
  const base: ValidationInput = { platform: "instagram", contentType: "feed", caption: "肩こりのセルフケア", cta: "保存してね", hashtags: ["#肩こり"], media: [media()] };

  it("Instagram: image post passes; text-only, PNG, bad ratio, stories are rejected with fixes", () => {
    expect(validateInstagram(base)).toMatchObject({ ok: true, format: "IG_IMAGE" });
    const noMedia = validateInstagram({ ...base, media: [] });
    expect(noMedia.ok).toBe(false);
    expect(noMedia.issues[0]?.fix).toContain("画像");
    expect(validateInstagram({ ...base, media: [media({ mimeType: "image/png" })] }).issues.map((i) => i.code)).toContain("ig.image_format");
    expect(validateInstagram({ ...base, media: [media({ width: 1080, height: 1920 })] }).issues.map((i) => i.code)).toContain("ig.image_ratio");
    expect(validateInstagram({ ...base, contentType: "story" }).issues.map((i) => i.code)).toContain("ig.story_unsupported");
  });

  it("Instagram: carousel 2–10 images, reels need 3s–15min video, caption/hashtag limits", () => {
    expect(validateInstagram({ ...base, media: [media(), media()] }).format).toBe("IG_CAROUSEL");
    expect(validateInstagram({ ...base, media: Array.from({ length: 11 }, () => media()) }).issues.map((i) => i.code)).toContain("ig.carousel_too_many");
    const reel = validateInstagram({ ...base, contentType: "reel", media: [media({ kind: "video", mimeType: "video/mp4", width: 1080, height: 1920, durationMs: 30_000 })] });
    expect(reel).toMatchObject({ ok: true, format: "IG_REEL" });
    expect(validateInstagram({ ...base, contentType: "reel", media: [media({ kind: "video", mimeType: "video/mp4", durationMs: 2_000 })] }).issues.map((i) => i.code)).toContain("ig.video_short");
    expect(validateInstagram({ ...base, caption: "あ".repeat(2300) }).issues.map((i) => i.code)).toContain("ig.caption_long");
    expect(validateInstagram({ ...base, hashtags: Array.from({ length: 31 }, (_, i) => `#t${i}`) }).issues.map((i) => i.code)).toContain("ig.hashtags");
  });

  it("Threads: 500 chars (emoji = UTF-8 bytes), ≤5 links, one topic tag, single media", () => {
    const t: ValidationInput = { platform: "threads", contentType: "threads_text", caption: "首こりの話", cta: "", hashtags: ["#首こり", "#肩こり"], media: [] };
    const ok = validateThreads(t);
    expect(ok).toMatchObject({ ok: true, format: "THREADS_TEXT" });
    expect(ok.text).toContain("#首こり");
    expect(ok.text).not.toContain("#肩こり");
    expect(ok.issues.map((i) => i.code)).toContain("th.single_topic_tag");
    expect(threadsLength("😀")).toBe(4);
    expect(validateThreads({ ...t, caption: "😀".repeat(130), hashtags: [] }).issues.map((i) => i.code)).toContain("th.text_long");
    const links = Array.from({ length: 6 }, (_, i) => `https://e.com/${i}`).join(" ");
    expect(validateThreads({ ...t, caption: links }).issues.map((i) => i.code)).toContain("th.links");
    expect(validateThreads({ ...t, media: [media({ mimeType: "image/png" })] }).format).toBe("THREADS_IMAGE");
    expect(validateThreads({ ...t, media: [media(), media()] }).ok).toBe(false);
  });
});

describe("error mapping & sanitization", () => {
  it("maps Meta error codes to retry / reconnect decisions", () => {
    expect(fromGraphError(400, { error: { code: 190, error_subcode: 463, type: "OAuthException", message: "expired" } }, "x").kind).toBe("token_expired");
    const rl = fromGraphError(400, { error: { code: 4, message: "rate" } }, "x");
    expect(rl.kind).toBe("rate_limited");
    expect(rl.retryable).toBe(true);
    expect(fromGraphError(400, { error: { code: 9004, error_subcode: 2207052 } }, "x").kind).toBe("media_processing");
    expect(fromGraphError(400, { error: { code: 36003, error_subcode: 2207009 } }, "x").kind).toBe("invalid_content");
    expect(fromGraphError(400, { error: { code: 10 } }, "x").kind).toBe("permission");
    expect(fromGraphError(503, {}, "x").kind).toBe("provider_unavailable");
    expect(new SocialApiError("token_expired", "x").retryable).toBe(false);
  });

  it("never leaks tokens or secrets in error text", () => {
    const s = sanitize("GET /me?access_token=IGQVJabcdefghijklmnopqrstuvwxyz&client_secret=shh failed Bearer abc.def");
    expect(s).not.toContain("IGQVJabcdef");
    expect(s).not.toContain("shh");
    expect(s).not.toContain("abc.def");
  });
});

describe("InstagramProvider (Instagram API with Instagram Login)", () => {
  it("connect: code (with #_) → short-lived → long-lived token → professional account profile", async () => {
    const g = fakeGraph({
      "POST /oauth/access_token": (body) => ({ json: { access_token: `short-${body.get("code")}`, user_id: 17841, permissions: ["instagram_business_basic", "instagram_business_content_publish"] } }),
      "GET /access_token": (_b, url) => ({ json: { access_token: `long-from-${url.searchParams.get("access_token")}`, expires_in: 5_184_000 } }),
      "GET /v26.0/me": () => ({ json: { user_id: "17841", username: "naoru_shinjuku", name: "NAORU 新宿院", account_type: "BUSINESS", followers_count: 120 } }),
    });
    const provider = new InstagramProvider(app, g.fetchImpl);
    const url = new URL(provider.getAuthorizationUrl({ state: "st", redirectUri: app.redirectUri }));
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights");
    expect(url.searchParams.get("state")).toBe("st");
    const result = await provider.connectAccount({ code: "abc#_", redirectUri: app.redirectUri });
    expect(g.calls[0]?.body.get("code")).toBe("abc");
    expect(g.calls[0]?.body.get("client_secret")).toBe("app-secret");
    expect(result.token.accessToken).toBe("long-from-short-abc");
    expect(new Date(result.token.expiresAt ?? 0).getTime()).toBeGreaterThan(Date.now() + 59 * 86_400_000);
    expect(result.candidates[0]).toMatchObject({ externalAccountId: "17841", username: "naoru_shinjuku", metadata: { account_type: "BUSINESS" } });
  });

  it("publish image: container → FINISHED → media_publish → permalink; token never in POST URLs", async () => {
    const g = fakeGraph({
      "POST /v26.0/17841/media": () => ({ json: { id: "c1" } }),
      "GET /v26.0/c1": () => ({ json: { status_code: "FINISHED" } }),
      "POST /v26.0/17841/media_publish": (body) => ({ json: { id: body.get("creation_id") === "c1" ? "m1" : "x" } }),
      "GET /v26.0/m1": () => ({ json: { permalink: "https://www.instagram.com/p/abc/" } }),
    });
    const created: string[] = [];
    const out = await new InstagramProvider(app, g.fetchImpl).publishPost({
      externalAccountId: "17841",
      accessToken: "TOKEN",
      format: "IG_IMAGE",
      text: "caption",
      media: [{ id: "a", kind: "image", mimeType: "image/jpeg", sizeBytes: 1, width: 1080, height: 1350, durationMs: null, url: "https://cdn/x.jpg" }],
      containerId: null,
      onContainerCreated: async (id) => void created.push(id),
    });
    expect(out).toMatchObject({ state: "published", providerPostId: "m1", permalink: "https://www.instagram.com/p/abc/" });
    expect(created).toEqual(["c1"]);
    expect(g.calls.filter((c) => c.method === "POST").every((c) => !c.url.search.includes("TOKEN"))).toBe(true);
    expect(g.calls[0]?.body.get("image_url")).toBe("https://cdn/x.jpg");
  });

  it("publish reel: processing → resumes with the container on the next tick", async () => {
    let status = "IN_PROGRESS";
    const g = fakeGraph({
      "POST /v26.0/17841/media": (body) => ({ json: { id: body.get("media_type") === "REELS" ? "r1" : "bad" } }),
      "GET /v26.0/r1": () => ({ json: { status_code: status } }),
      "POST /v26.0/17841/media_publish": () => ({ json: { id: "m2" } }),
      "GET /v26.0/m2": () => ({ json: {} }),
    });
    const p = new InstagramProvider(app, g.fetchImpl);
    const req = { externalAccountId: "17841", accessToken: "T", format: "IG_REEL" as const, text: "t", media: [{ id: "v", kind: "video" as const, mimeType: "video/mp4", sizeBytes: 1, width: 1080, height: 1920, durationMs: 30_000, url: "https://cdn/v.mp4" }], containerId: null };
    expect(await p.publishPost(req)).toMatchObject({ state: "processing", containerId: "r1" });
    status = "FINISHED";
    expect(await p.publishPost({ ...req, containerId: "r1" })).toMatchObject({ state: "published", providerPostId: "m2" });
    expect(g.calls.filter((c) => c.method === "POST" && c.url.pathname.endsWith("/media"))).toHaveLength(1);
  });

  it("expired token surfaces as token_expired (no retry)", async () => {
    const g = fakeGraph({ "POST /v26.0/17841/media": () => ({ status: 400, json: { error: { code: 190, type: "OAuthException", message: "Session has expired" } } }) });
    await expect(
      new InstagramProvider(app, g.fetchImpl).publishPost({ externalAccountId: "17841", accessToken: "T", format: "IG_IMAGE", text: "", media: [{ id: "a", kind: "image", mimeType: "image/jpeg", sizeBytes: 1, width: 1, height: 1, durationMs: null, url: "u" }], containerId: null }),
    ).rejects.toMatchObject({ kind: "token_expired" });
  });

  it("insights use current metrics only (no deprecated impressions/plays) and normalize", async () => {
    const g = fakeGraph({
      "GET /v26.0/m1/insights": (_b, url) => ({
        json: { data: url.searchParams.get("metric")!.split(",").map((name) => ({ name, values: [{ value: name === "reach" ? 1000 : name === "saved" ? 50 : 10 }] })) },
      }),
    });
    const res = await new InstagramProvider(app, g.fetchImpl).getPostInsights({ accessToken: "T", providerPostId: "m1", format: "IG_IMAGE" });
    const metric = g.calls[0]?.url.searchParams.get("metric") ?? "";
    expect(metric).not.toMatch(/impressions|plays|video_views/);
    expect(res.metrics).toMatchObject({ reach: 1000, saves: 50, views: 10, profileVisits: 10 });
  });
});

describe("ThreadsProvider", () => {
  const tapp = { ...app, redirectUri: "https://app.example.com/api/social/callback/threads" };
  it("connect + text publish via graph.threads.com", async () => {
    const g = fakeGraph({
      "POST /oauth/access_token": () => ({ json: { access_token: "short", user_id: "99" } }),
      "GET /access_token": (_b, url) => ({ json: { access_token: url.searchParams.get("grant_type") === "th_exchange_token" ? "long" : "x", expires_in: 5_184_000 } }),
      "GET /v1.0/me": () => ({ json: { id: "99", username: "naoru_careers", threads_profile_picture_url: "https://p" } }),
      "POST /v1.0/99/threads": (body) => ({ json: { id: body.get("media_type") === "TEXT" ? "tc1" : "bad" } }),
      "GET /v1.0/tc1": () => ({ json: { status: "FINISHED" } }),
      "POST /v1.0/99/threads_publish": () => ({ json: { id: "tp1" } }),
      "GET /v1.0/tp1": () => ({ json: { permalink: "https://www.threads.com/@naoru_careers/post/x" } }),
    });
    const p = new ThreadsProvider(tapp, g.fetchImpl);
    const auth = new URL(p.getAuthorizationUrl({ state: "s", redirectUri: tapp.redirectUri }));
    expect(auth.host).toBe("www.threads.com");
    expect(auth.searchParams.get("scope")).toBe("threads_basic,threads_content_publish,threads_manage_insights");
    const c = await p.connectAccount({ code: "code", redirectUri: tapp.redirectUri });
    expect(c.candidates[0]).toMatchObject({ externalAccountId: "99", username: "naoru_careers" });
    expect(g.calls.every((x) => x.url.host === "graph.threads.com")).toBe(true);
    const out = await p.publishPost({ externalAccountId: "99", accessToken: c.token.accessToken, format: "THREADS_TEXT", text: "hello", media: [], containerId: null });
    expect(out).toMatchObject({ state: "published", providerPostId: "tp1" });
  });

  it("normalizes Threads metrics (no reach/saves; replies → comments; reposts/quotes kept platform-specific)", () => {
    const v = threadsInsightValues({ data: [{ name: "views", values: [{ value: 500 }] }, { name: "likes", values: [{ value: 20 }] }, { name: "replies", values: [{ value: 3 }] }, { name: "reposts", values: [{ value: 2 }] }, { name: "quotes", values: [{ value: 1 }] }, { name: "shares", values: [{ value: 4 }] }] });
    const m = normalizeThreads(v);
    expect(m).toMatchObject({ views: 500, likes: 20, comments: 3, shares: 4, engagements: 30, platformSpecific: { reposts: 2, quotes: 1 } });
    expect(m.reach).toBeUndefined();
    expect(m.saves).toBeUndefined();
    expect(normalizeInstagramMedia(insightValues({ data: [{ name: "reach", total_value: { value: 9 } }] })).reach).toBe(9);
  });
});

describe("connection status & Meta callbacks", () => {
  it("derives Connected / Token Expiring / Reconnect Required", () => {
    const now = new Date("2026-10-06T00:00:00Z");
    const c = { ...emptyConnection(), status: "connected" as const };
    expect(connectionBadge({ ...c, tokenExpiresAt: "2026-11-30T00:00:00Z" }, now)).toBe("connected");
    expect(connectionBadge({ ...c, tokenExpiresAt: "2026-10-09T00:00:00Z" }, now)).toBe("expiring");
    expect(connectionBadge({ ...c, tokenExpiresAt: "2026-10-01T00:00:00Z" }, now)).toBe("reconnect");
    expect(connectionBadge({ ...c, status: "reauthorization_required" }, now)).toBe("reconnect");
    expect(connectionBadge(emptyConnection(), now)).toBe("not_connected");
  });

  it("verifies signed_request and webhook signatures with the app secret", () => {
    process.env.INSTAGRAM_APP_ID = "1";
    process.env.INSTAGRAM_APP_SECRET = "ig-secret";
    const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "17841" })).toString("base64url");
    const sig = createHmac("sha256", "ig-secret").update(payload).digest("base64url");
    expect(parseSignedRequest(`${sig}.${payload}`)).toEqual({ platform: "instagram", userId: "17841" });
    expect(parseSignedRequest(`${sig}x.${payload}`)).toBeNull();
    const body = JSON.stringify({ object: "instagram", entry: [] });
    expect(verifyWebhookSignature(body, `sha256=${createHmac("sha256", "ig-secret").update(body).digest("hex")}`)).toBe("instagram");
    expect(verifyWebhookSignature(body, "sha256=deadbeef")).toBeNull();
    delete process.env.INSTAGRAM_APP_ID;
    delete process.env.INSTAGRAM_APP_SECRET;
  });
});
