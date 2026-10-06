import { describe, expect, it } from "vitest";
import { DemoRepository } from "@/lib/data/demo-repository";
import { RepositoryError } from "@/lib/data/repository";
import { createDemoOrganization } from "@/lib/services/organizations";
import { DEMO_BRAND_BRAIN } from "@/lib/demo/seed";

describe("DemoRepository", () => {
  it("runs the onboarding → brand brain → post flow", async () => {
    const repo = new DemoRepository("user-a");
    const org = await repo.createOrganization("Aサロン");
    const before = await repo.getBrandBrain(org.id);
    expect(before?.onboardingCompletedAt).toBeNull();

    await repo.saveBrandBrain(org.id, { ...DEMO_BRAND_BRAIN, brandName: "Aサロン" }, { onboardingStep: 3 });
    const done = await repo.saveBrandBrain(org.id, { ...DEMO_BRAND_BRAIN, brandName: "Aサロン" }, { onboardingStep: 6, completeOnboarding: true });
    expect(done.onboardingCompletedAt).not.toBeNull();
    expect(done.onboardingStep).toBe(6);
    expect(done.locations[0]?.id).toBeTruthy();

    const scheduledAt = new Date(Date.now() + 86_400_000).toISOString();
    await repo.createPost(org.id, {
      platform: "instagram", contentType: "reel", title: "t", caption: "c", cta: "", hashtags: ["#a"],
      status: "scheduled", scheduledAt, source: "ai_post_creator",
    });
    const posts = await repo.listPosts(org.id);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.scheduledAt).toBe(scheduledAt);

    const conv = await repo.createConversation(org.id, "相談");
    await repo.appendMessage(org.id, conv.id, { role: "user", content: "こんにちは" });
    expect((await repo.getConversation(org.id, conv.id))?.messages).toHaveLength(1);
  });

  it("isolates organizations between users", async () => {
    const a = new DemoRepository("user-x");
    const b = new DemoRepository("user-y");
    const orgA = await a.createOrganization("X");
    await expect(b.getBrandBrain(orgA.id)).rejects.toBeInstanceOf(RepositoryError);
    await expect(b.listPosts(orgA.id)).rejects.toBeInstanceOf(RepositoryError);
    await expect(b.saveBrandBrain(orgA.id, DEMO_BRAND_BRAIN)).rejects.toBeInstanceOf(RepositoryError);
    expect((await b.listMemberships()).some((m) => m.organization.id === orgA.id)).toBe(false);
  });

  it("creates demo organizations flagged is_demo with seeded posts", async () => {
    const repo = new DemoRepository("user-demo");
    const org = await createDemoOrganization(repo);
    expect(org.isDemo).toBe(true);
    expect((await repo.listPosts(org.id)).length).toBeGreaterThan(3);
    expect((await repo.getBrandBrain(org.id))?.onboardingCompletedAt).not.toBeNull();
  });
});
