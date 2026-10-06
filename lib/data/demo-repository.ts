import "server-only";
import type {
  BrandBrain,
  BrandBrainInput,
  ChatMessage,
  Conversation,
  ID,
  NewPostInput,
  Organization,
  OrganizationMembership,
  Post,
} from "@/lib/domain/types";
import { emptyBrandBrainInput } from "@/lib/brand/defaults";
import { sortPosts } from "@/lib/domain/posts";
import { getDemoStore, newId, persistDemoStore } from "./demo-store";
import {
  RepositoryError,
  type DataRepository,
  type PostPatch,
  type SaveBrandBrainOptions,
} from "./repository";

const now = () => new Date().toISOString();

export class DemoRepository implements DataRepository {
  readonly mode = "demo" as const;

  constructor(readonly userId: ID) {}

  /** Tenant guard: equivalent of RLS for the in-memory store. */
  private assertMember(organizationId: ID, write = false): void {
    const member = getDemoStore().members.find(
      (m) => m.organizationId === organizationId && m.userId === this.userId,
    );
    if (!member) throw new RepositoryError("organization not found", "not_found");
    if (write && member.role === "viewer") throw new RepositoryError("read-only member", "forbidden");
  }

  async listMemberships(): Promise<OrganizationMembership[]> {
    const store = getDemoStore();
    return store.members
      .filter((m) => m.userId === this.userId)
      .flatMap((m) => {
        const organization = store.organizations.find((o) => o.id === m.organizationId);
        return organization ? [{ organization, role: m.role }] : [];
      })
      .sort((a, b) => a.organization.createdAt.localeCompare(b.organization.createdAt));
  }

  async createOrganization(name: string, options?: { isDemo?: boolean }): Promise<Organization> {
    const store = getDemoStore();
    const organization: Organization = {
      id: newId(),
      name: name.trim(),
      isDemo: options?.isDemo ?? false,
      createdAt: now(),
    };
    store.organizations.push(organization);
    store.members.push({ organizationId: organization.id, userId: this.userId, role: "owner" });
    store.brands.push({
      ...emptyBrandBrainInput(),
      companyName: organization.name,
      brandName: organization.name,
      brandId: newId(),
      organizationId: organization.id,
      onboardingStep: 0,
      onboardingCompletedAt: null,
      updatedAt: now(),
    });
    persistDemoStore();
    return organization;
  }

  async renameOrganization(organizationId: ID, name: string): Promise<void> {
    this.assertMember(organizationId, true);
    const org = getDemoStore().organizations.find((o) => o.id === organizationId);
    if (org) org.name = name.trim();
    persistDemoStore();
  }

  async getBrandBrain(organizationId: ID): Promise<BrandBrain | null> {
    this.assertMember(organizationId);
    const brain = getDemoStore().brands.find((b) => b.organizationId === organizationId);
    return brain ? structuredClone(brain) : null;
  }

  async saveBrandBrain(
    organizationId: ID,
    input: BrandBrainInput,
    options: SaveBrandBrainOptions = {},
  ): Promise<BrandBrain> {
    this.assertMember(organizationId, true);
    const store = getDemoStore();
    const index = store.brands.findIndex((b) => b.organizationId === organizationId);
    const current = store.brands[index];
    if (!current) throw new RepositoryError("brand not found", "not_found");
    const saved: BrandBrain = {
      ...current,
      ...structuredClone(input),
      locations: input.locations.map((l) => ({ ...l, id: l.id ?? newId() })),
      onboardingStep: Math.max(current.onboardingStep, options.onboardingStep ?? 0),
      onboardingCompletedAt:
        current.onboardingCompletedAt ?? (options.completeOnboarding ? now() : null),
      updatedAt: now(),
    };
    store.brands[index] = saved;
    persistDemoStore();
    return structuredClone(saved);
  }

  async listPosts(organizationId: ID): Promise<Post[]> {
    this.assertMember(organizationId);
    return sortPosts(getDemoStore().posts.filter((p) => p.organizationId === organizationId)).map((p) =>
      structuredClone(p),
    );
  }

  async createPost(organizationId: ID, input: NewPostInput): Promise<Post> {
    this.assertMember(organizationId, true);
    const post: Post = {
      id: newId(),
      organizationId,
      platform: input.platform,
      contentType: input.contentType,
      title: input.title,
      caption: input.caption,
      cta: input.cta,
      hashtags: [...input.hashtags],
      status: input.status,
      source: input.source,
      scheduledAt: input.scheduledAt,
      createdAt: now(),
    };
    getDemoStore().posts.push(post);
    persistDemoStore();
    return structuredClone(post);
  }

  async updatePost(organizationId: ID, postId: ID, patch: PostPatch): Promise<Post> {
    this.assertMember(organizationId, true);
    const post = getDemoStore().posts.find((p) => p.id === postId && p.organizationId === organizationId);
    if (!post) throw new RepositoryError("post not found", "not_found");
    Object.assign(post, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    persistDemoStore();
    return structuredClone(post);
  }

  async listConversations(organizationId: ID): Promise<Omit<Conversation, "messages">[]> {
    this.assertMember(organizationId);
    return getDemoStore()
      .conversations.filter((c) => c.organizationId === organizationId && c.userId === this.userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
  }

  async getConversation(organizationId: ID, conversationId: ID): Promise<Conversation | null> {
    this.assertMember(organizationId);
    const c = getDemoStore().conversations.find(
      (x) => x.id === conversationId && x.organizationId === organizationId && x.userId === this.userId,
    );
    return c ? structuredClone({ id: c.id, title: c.title, updatedAt: c.updatedAt, messages: c.messages }) : null;
  }

  async createConversation(organizationId: ID, title: string): Promise<Omit<Conversation, "messages">> {
    this.assertMember(organizationId, true);
    const record = { id: newId(), organizationId, userId: this.userId, title, updatedAt: now(), messages: [] };
    getDemoStore().conversations.push(record);
    persistDemoStore();
    return { id: record.id, title: record.title, updatedAt: record.updatedAt };
  }

  async appendMessage(
    organizationId: ID,
    conversationId: ID,
    message: { role: ChatMessage["role"]; content: string },
  ): Promise<ChatMessage> {
    this.assertMember(organizationId, true);
    const c = getDemoStore().conversations.find(
      (x) => x.id === conversationId && x.organizationId === organizationId && x.userId === this.userId,
    );
    if (!c) throw new RepositoryError("conversation not found", "not_found");
    const saved: ChatMessage = { id: newId(), role: message.role, content: message.content, createdAt: now() };
    c.messages.push(saved);
    c.updatedAt = saved.createdAt;
    persistDemoStore();
    return structuredClone(saved);
  }
}
