import { beforeEach, describe, expect, it } from "vitest";
import type { AppContext } from "@/lib/auth/context";
import { DemoRepository } from "@/lib/data/demo-repository";
import { getDemoStore } from "@/lib/data/demo-store";
import type { Post } from "@/lib/domain/types";
import { createDemoOrganization } from "@/lib/services/organizations";
import { applyRecommendationDecision } from "@/lib/services/recommendations";
import { DemoSocialStore } from "@/lib/social/demo-store";
import { completeConnection, getPendingCandidates, handleCallback } from "@/lib/social/connections";
import { createOAuthState } from "@/lib/social/oauth-state";
import { MockSocialProvider } from "@/lib/social/mock";
import { approvePost, cancelJob, getPostPublishState, processDueJobs, publishNow, schedulePost } from "@/lib/social/publish-queue";
import { syncInsights } from "@/lib/social/insights-sync";
import { reviewPostPerformance } from "@/lib/social/performance";
import { canAccessLocation, filterByLocation } from "@/lib/social/access";
import { computeAttention, computePerformanceOverview } from "@/lib/social/analytics";
import { rankLearnings } from "@/lib/social/memory";
import { formatScopeContext } from "@/lib/brand/context";
import { SocialStoreError } from "@/lib/social/store";

const store = new DemoSocialStore();

async function setup(userId: string) {
  const repo = new DemoRepository(userId);
  const org = await createDemoOrganization(repo, { social: store });
  return { repo, org, app: await appFor(repo, org.id) };
}

async function appFor(repo: DemoRepository, orgId: string): Promise<AppContext> {
  const memberships = await repo.listMemberships();
  const current = memberships.find((m) => m.organization.id === orgId);
  const brain = await repo.getBrandBrain(orgId).catch(() => null);
  if (!current || !brain) throw new Error("no membership");
  return { user: { id: repo.userId, email: `${repo.userId}@example.com`, displayName: "テスト" }, repo, memberships, current, brain };
}

async function futurePost(app: AppContext, handle: string, predicate: (p: Post) => boolean = () => true): Promise<Post> {
  const accounts = await app.repo.listAccounts(app.current.organization.id);
  const account = accounts.find((a) => a.handle === handle);
  const post = (await app.repo.listPosts(app.current.organization.id)).find(
    (p) => p.accountId === account?.id && p.status !== "published" && p.scheduledAt && new Date(p.scheduledAt) > new Date(Date.now() + 3600_000) && predicate(p),
  );
  if (post) return post;
  // Create one if the month has no future slot left.
  return app.repo.createPost(app.current.organization.id, {
    platform: account!.platform,
    contentType: account!.platform === "threads" ? "threads_text" : "feed",
    title: "テスト投稿",
    caption: "肩こりのセルフケア",
    cta: "保存してね",
    hashtags: ["#肩こり"],
    status: "scheduled",
    scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    source: "manual",
    accountId: account!.id,
    locationId: account!.locationId,
  });
}

async function addImage(app: AppContext, post: Post, patch: Partial<{ kind: "image" | "video"; mimeType: string; durationMs: number | null; height: number }> = {}) {
  return store.createMedia({
    organizationId: app.current.organization.id,
    locationId: post.locationId,
    postId: post.id,
    storagePath: `${app.current.organization.id}/x/posts/${post.id}/${Math.random()}.jpg`,
    kind: patch.kind ?? "image",
    mimeType: patch.mimeType ?? "image/jpeg",
    sizeBytes: 400_000,
    width: 1080,
    height: patch.height ?? 1350,
    durationMs: patch.durationMs ?? null,
    sortOrder: 0,
    status: "ready",
  });
}

async function setCaption(app: AppContext, post: Post, caption: string) {
  return app.repo.updatePost(app.current.organization.id, post.id, { caption });
}

const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);

beforeEach(() => {
  // fresh in-memory store per test file run is enough; ids are random per org
});

describe("demo seed: the loop has data on day one", () => {
  it("connects accounts (incl. Token Expiring / Reconnect Required) and stores time-series insights", async () => {
    const { app, org } = await setup("loop-seed");
    const accounts = await app.repo.listAccounts(org.id);
    const by = (h: string) => accounts.find((a) => a.handle === h)!;
    expect(by("@naoru_shibuya").connection.status).toBe("connected");
    expect(by("@naoru_yokohama_threads").connection.status).toBe("reauthorization_required");
    expect(new Date(by("@naoru_ikebukuro_threads").connection.tokenExpiresAt!).getTime()).toBeLessThan(Date.now() + 7 * 86_400_000);
    // public account data never contains the token
    expect(JSON.stringify(accounts)).not.toContain("mock_demo_");
    const jobs = await store.listJobs(org.id, { statuses: ["published"] });
    expect(jobs.length).toBeGreaterThan(15);
    const snaps = await store.listSnapshots(org.id, { postIds: [jobs[jobs.length - 1]!.postId], scope: "post" });
    expect(snaps.length).toBeGreaterThanOrEqual(3);
    expect(snaps.map((s) => s.hoursSincePublish)).toEqual([...snaps.map((s) => s.hoursSincePublish)].sort((a, b) => (a ?? 0) - (b ?? 0)));
    expect((await store.listLearnings(org.id)).length).toBeGreaterThan(0);
    expect((await store.listReviews(org.id)).length).toBeGreaterThan(0);
  });
});

describe("OAuth connect → account selection → connection saved", () => {
  it("binds a new Instagram account to a location; tokens stay server-side", async () => {
    const { app, org } = await setup("loop-connect");
    const { state, cookie } = createOAuthState({ userId: app.user.id, organizationId: org.id, platform: "instagram", accountId: null });
    const cb = await handleCallback(app, "instagram", { code: MockSocialProvider.createCode("instagram", "naoru_shinjuku"), state, error: null }, cookie);
    expect(cb.ok).toBe(true);
    if (!cb.ok) return;
    const pending = await getPendingCandidates(app, cb.pendingId);
    expect(pending?.candidates[0]?.username).toBe("naoru_shinjuku");
    expect(JSON.stringify(pending)).not.toMatch(/accessToken|access_token/);
    const shibuya = app.brain.locations[0]!.id!;
    const account = await completeConnection(app, { pendingId: cb.pendingId, externalAccountId: pending!.candidates[0]!.externalAccountId, target: { mode: "new", locationId: shibuya, goal: "acquisition", displayName: "新宿院 Instagram" } });
    const saved = (await app.repo.listAccounts(org.id)).find((a) => a.id === account.id)!;
    expect(saved).toMatchObject({ handle: "@naoru_shinjuku", locationId: shibuya, goal: "acquisition", connection: { status: "connected", username: "naoru_shinjuku" } });
    const credential = await store.getCredential(org.id, account.id);
    expect(credential?.token.accessToken).toMatch(/^mock_/);
    const raw = getDemoStore().social.credentials.find((c) => c.socialAccountId === account.id)!;
    expect(raw.ciphertext).not.toContain(credential!.token.accessToken);
    // pending is single-use
    await expect(completeConnection(app, { pendingId: cb.pendingId, externalAccountId: "x", target: { mode: "existing", accountId: account.id } })).rejects.toBeInstanceOf(SocialStoreError);
    expect((await store.listEvents(org.id)).some((e) => e.type === "account_connected" && e.socialAccountId === account.id)).toBe(true);
  });

  it("rejects forged state, denied consent and duplicate connections", async () => {
    const { app, org } = await setup("loop-connect-2");
    const { cookie } = createOAuthState({ userId: app.user.id, organizationId: org.id, platform: "threads", accountId: null });
    expect(await handleCallback(app, "threads", { code: "x", state: "forged", error: null }, cookie)).toMatchObject({ ok: false, reason: "state" });
    const s2 = createOAuthState({ userId: app.user.id, organizationId: org.id, platform: "threads", accountId: null });
    expect(await handleCallback(app, "threads", { code: null, state: s2.state, error: "access_denied" }, s2.cookie)).toMatchObject({ ok: false, reason: "denied" });
    // naoru_careers is already connected as @naoru_careers → connecting it to another account is refused
    const s3 = createOAuthState({ userId: app.user.id, organizationId: org.id, platform: "threads", accountId: null });
    const cb = await handleCallback(app, "threads", { code: MockSocialProvider.createCode("threads", "naoru_careers"), state: s3.state, error: null }, s3.cookie);
    if (!cb.ok) throw new Error("callback failed");
    const other = (await app.repo.listAccounts(org.id)).find((a) => a.handle === "@naoru_shibuya_threads")!;
    await expect(completeConnection(app, { pendingId: cb.pendingId, externalAccountId: `mock_threads_${0}`.replace("0", ""), target: { mode: "existing", accountId: other.id } })).rejects.toThrow();
    const ext = (await getPendingCandidates(app, cb.pendingId))!.candidates[0]!.externalAccountId;
    await expect(completeConnection(app, { pendingId: cb.pendingId, externalAccountId: ext, target: { mode: "existing", accountId: other.id } })).rejects.toThrow(/既に/);
  });
});

describe("Human approval → Publish Queue → publish", () => {
  it("validation blocks unapproved / invalid posts; scheduled publish runs only when due", async () => {
    const { app, org } = await setup("loop-schedule");
    const post = await futurePost(app, "@naoru_shibuya");
    let state = await getPostPublishState(app, post.id);
    expect(state.readiness.canApprove).toBe(false); // Instagram needs media
    expect(state.readiness.validation?.issues.some((i) => i.code === "ig.media_required")).toBe(true);
    await expect(schedulePost(app, post.id)).rejects.toThrow();
    await addImage(app, post);
    await approvePost(app, post.id);
    state = await getPostPublishState(app, post.id);
    expect(state.post.status).toBe("approved");
    expect(state.readiness.canSchedule).toBe(true);
    const job = await schedulePost(app, post.id);
    expect(job).toMatchObject({ status: "queued", mode: "scheduled", scheduledAt: post.scheduledAt, format: "IG_IMAGE" });
    expect(job.content.text).toContain(post.caption.slice(0, 10));
    // a second job for the same post is refused
    await expect(schedulePost(app, post.id)).rejects.toThrow();
    // not due yet
    expect((await processDueJobs(store, { organizationId: org.id })).claimed).toBe(0);
    const due = new Date(new Date(post.scheduledAt!).getTime() + 60_000);
    const summary = await processDueJobs(store, { organizationId: org.id, now: due });
    expect(summary.published).toBe(1);
    const after = (await app.repo.listPosts(org.id)).find((p) => p.id === post.id)!;
    expect(after.status).toBe("published");
    expect(after.publishing.providerPostId).toMatch(/^mock_ig_/);
    expect((await store.listEvents(org.id, { postId: post.id })).map((e) => e.type)).toEqual(expect.arrayContaining(["post_approved", "publish_queued", "publish_started", "publish_success"]));
  });

  it("publishes immediately (Threads text) and supports cancel", async () => {
    const { app, org } = await setup("loop-now");
    const post = await futurePost(app, "@naoru_shibuya_threads");
    await approvePost(app, post.id);
    const job = await publishNow(app, post.id);
    expect(job).toMatchObject({ status: "published", mode: "immediate", attemptCount: 1 });
    const other = await futurePost(app, "@naoru_ikebukuro_threads", (p) => p.id !== post.id);
    await approvePost(app, other.id);
    const queued = await schedulePost(app, other.id);
    await cancelJob(app, queued.id);
    expect((await store.getJob(org.id, queued.id))?.status).toBe("cancelled");
    expect((await app.repo.listPosts(org.id)).find((p) => p.id === other.id)?.status).toBe("approved");
  });

  it("retries a transient failure, then succeeds", async () => {
    const { app, org } = await setup("loop-retry");
    const post = await futurePost(app, "@naoru_careers");
    await setCaption(app, post, "[fail-once:rate_limit] 見学会のお知らせ");
    await approvePost(app, post.id);
    const job = await publishNow(app, post.id);
    expect(job).toMatchObject({ status: "retrying", attemptCount: 1 });
    expect(job.lastError).toContain("rate_limit");
    expect((await app.repo.listPosts(org.id)).find((p) => p.id === post.id)?.publishing.error).toContain("再試行");
    const done = await processDueJobs(store, { organizationId: org.id, now: later(2) });
    expect(done.published).toBe(1);
    expect((await store.getJob(org.id, job.id))).toMatchObject({ status: "published", attemptCount: 2 });
  });

  it("stops after max attempts (no infinite retry) and marks the post failed", async () => {
    const { app, org } = await setup("loop-fail");
    const post = await futurePost(app, "@naoru_careers");
    await setCaption(app, post, "[fail:rate_limit] ずっと失敗する投稿");
    await approvePost(app, post.id);
    const job = await publishNow(app, post.id);
    await processDueJobs(store, { organizationId: org.id, now: later(2) });
    await processDueJobs(store, { organizationId: org.id, now: later(5) });
    await processDueJobs(store, { organizationId: org.id, now: later(10) });
    const final = await store.getJob(org.id, job.id);
    expect(final).toMatchObject({ status: "failed", attemptCount: 3, maxAttempts: 3 });
    expect((await app.repo.listPosts(org.id)).find((p) => p.id === post.id)?.status).toBe("failed");
    expect((await processDueJobs(store, { organizationId: org.id, now: later(120) })).claimed).toBe(0);
  });

  it("token / permission errors fail fast and require reconnection", async () => {
    const { app, org } = await setup("loop-token");
    const post = await futurePost(app, "@naoru_careers");
    await setCaption(app, post, "[fail:token] 認証切れ");
    await approvePost(app, post.id);
    const job = await publishNow(app, post.id);
    expect(job).toMatchObject({ status: "failed", attemptCount: 1 });
    const account = (await app.repo.listAccounts(org.id)).find((a) => a.id === post.accountId)!;
    expect(account.connection.status).toBe("reauthorization_required");
    // the next post to that account is blocked before it reaches the queue
    const next = await futurePost(app, "@naoru_careers", (p) => p.id !== post.id);
    await approvePost(app, next.id);
    await expect(publishNow(app, next.id)).rejects.toThrow(/認証が切れています|接続/);
  });

  it("video: container processing does not consume attempts; resumes on the next tick", async () => {
    const { app, org } = await setup("loop-video");
    const post = await futurePost(app, "@naoru_shibuya");
    await app.repo.updatePost(org.id, post.id, {});
    await addImage(app, post, { kind: "video", mimeType: "video/mp4", durationMs: 30_000, height: 1920 });
    getDemoStore().posts.find((p) => p.id === post.id)!.contentType = "reel";
    await approvePost(app, post.id);
    const job = await publishNow(app, post.id);
    expect(job).toMatchObject({ status: "publishing", format: "IG_REEL" });
    expect(job.providerContainerId).toMatch(/^mockc_/);
    await processDueJobs(store, { organizationId: org.id, now: later(2) });
    expect(await store.getJob(org.id, job.id)).toMatchObject({ status: "published", attemptCount: 1 });
  });
});

describe("Measure → Analyze → Learn → Next plan", () => {
  it("syncs insights at checkpoints without duplicating snapshots", async () => {
    const { app, org } = await setup("loop-insights");
    const post = await futurePost(app, "@naoru_shibuya_threads");
    await approvePost(app, post.id);
    await publishNow(app, post.id);
    const first = await syncInsights(store, { organizationId: org.id, postId: post.id, now: later(90) });
    expect(first.postSnapshots).toBe(1);
    expect((await syncInsights(store, { organizationId: org.id, postId: post.id, now: later(100) })).postSnapshots).toBe(0);
    expect((await syncInsights(store, { organizationId: org.id, postId: post.id, now: later(25 * 60) })).postSnapshots).toBe(1);
    const snaps = await store.listSnapshots(org.id, { postIds: [post.id] });
    expect(snaps.map((s) => Math.floor(s.hoursSincePublish ?? 0))).toEqual([1, 25]);
    expect(snaps[1]!.metrics.views).toBeGreaterThanOrEqual(snaps[0]!.metrics.views ?? 0);
    expect(snaps[1]!.metrics.reach).toBeUndefined(); // Threads has no reach
  });

  it("AI Performance Review → Marketing Memory + recommendation → approved into the planner", async () => {
    const { app, org } = await setup("loop-review");
    const accounts = await app.repo.listAccounts(org.id);
    const shibuya = accounts.find((a) => a.handle === "@naoru_shibuya")!;
    const posts = await app.repo.listPosts(org.id);
    // the account's best post by save rate
    const latest = (await store.listSnapshots(org.id, { accountId: shibuya.id, scope: "post" })).filter((s) => (s.hoursSincePublish ?? 0) >= 72);
    const best = latest.sort((x, y) => (y.metrics.saves ?? 0) / (y.metrics.reach || 1) - (x.metrics.saves ?? 0) / (x.metrics.reach || 1))[0]!;
    const howTo = posts.find((p) => p.id === best.postId)!;
    const before = (await store.listLearnings(org.id)).length;
    const review = await reviewPostPerformance({ store, repo: app.repo }, org.id, howTo.id, app.user.id);
    expect(review.summary).toMatch(/保存率/);
    expect(review.confidence).toBeGreaterThan(0.5);
    const learnings = await store.listLearnings(org.id);
    expect(learnings.length).toBe(before + 1);
    expect(learnings[0]!.learning).toContain("渋谷院");
    expect(learnings[0]!.sourcePostIds).toEqual([howTo.id]);
    expect(learnings[0]!.learning).toMatch(/高い/);
    const rec = (await app.repo.listRecommendations(org.id)).find((r) => r.source === "performance" && r.socialAccountId === shibuya.id && r.recommendedAction.includes("2本"));
    expect(rec?.recommendedAction).toMatch(/2本/);
    const approved = await app.repo.setRecommendationStatus(org.id, rec!.id, "approved");
    const draft = await applyRecommendationDecision(app, approved, "approved");
    expect(draft).toMatchObject({ status: "draft", accountId: shibuya.id });
    expect(draft!.title).toContain("AI提案");
    // Marketing Memory reaches the next plan / post prompt
    const memory = rankLearnings(await store.listLearnings(org.id, { status: "active" }), { accountId: shibuya.id, locationId: shibuya.locationId, platform: "instagram" });
    expect(memory[0]!.socialAccountId).toBe(shibuya.id);
    expect(formatScopeContext({ account: shibuya, memory })).toContain("Marketing Memory");
  });

  it("dashboard read models: goal-specific overview and HQ attention list", async () => {
    const { app, org } = await setup("loop-analytics");
    const [posts, accounts, locations, snapshots] = await Promise.all([
      app.repo.listPosts(org.id),
      app.repo.listAccounts(org.id),
      app.repo.listLocationProfiles(org.id),
      store.listSnapshots(org.id),
    ]);
    const all = computePerformanceOverview({ posts, accounts, locations, snapshots });
    expect(all.insufficient).toBe(false);
    expect(all.topPosts.length).toBe(3);
    expect(all.followerGrowth).toBeGreaterThan(0);
    const recruit = computePerformanceOverview({ posts, accounts, locations, snapshots }, { goal: "recruitment" });
    expect(recruit.measuredCount).toBeLessThan(all.measuredCount);
    expect(recruit.byGoal.map((g) => g.key)).toEqual(["recruitment"]);
    const attention = computeAttention({ posts, accounts, locations, snapshots });
    expect(attention[0]).toMatchObject({ kind: "problem" });
    expect(attention[0]!.title).toContain("再接続");
  });
});

describe("organization & location isolation", () => {
  it("another organization cannot read or drive this organization's queue", async () => {
    const a = await setup("iso-a");
    const b = await setup("iso-b");
    const postA = await futurePost(a.app, "@naoru_shibuya_threads");
    await expect(approvePost(b.app, postA.id)).rejects.toThrow();
    const jobsA = await store.listJobs(a.org.id);
    expect(jobsA.length).toBeGreaterThan(0);
    expect((await store.listJobs(b.org.id)).some((j) => jobsA.some((x) => x.id === j.id))).toBe(false);
    const accountA = (await a.app.repo.listAccounts(a.org.id))[0]!;
    expect(await store.getCredential(b.org.id, accountA.id)).toBeNull();
    expect(await store.getJob(b.org.id, jobsA[0]!.id)).toBeNull();
  });

  it("a location-scoped member only acts on their own location", async () => {
    const { app, org, repo } = await setup("iso-loc");
    const ikebukuro = app.brain.locations[1]!.id!;
    getDemoStore().members.push({ organizationId: org.id, userId: "loc-manager", role: "editor", locationIds: [ikebukuro] });
    const managerRepo = new DemoRepository("loc-manager");
    const manager = await appFor(managerRepo, org.id);
    expect(manager.current.locationIds).toEqual([ikebukuro]);
    const shibuyaPost = await futurePost(app, "@naoru_shibuya_threads");
    await expect(approvePost(manager, shibuyaPost.id)).rejects.toThrow(/権限/);
    const ikebukuroPost = await futurePost(app, "@naoru_ikebukuro_threads");
    await approvePost(manager, ikebukuroPost.id);
    expect(canAccessLocation({ locationIds: [ikebukuro] }, null)).toBe(false);
    const jobs = await store.listJobs(org.id);
    expect(filterByLocation({ locationIds: [ikebukuro] }, jobs).every((j) => j.locationId === ikebukuro)).toBe(true);
    void repo;
  });
});
