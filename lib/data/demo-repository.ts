import "server-only";
import type {
  BrandBrain,
  BrandBrainInput,
  ChatMessage,
  Conversation,
  ID,
  NewPostInput,
  HqCampaign,
  HqCampaignInput,
  LocationProfile,
  LocationProfileInput,
  Organization,
  OrganizationMembership,
  Post,
  SnsAccount,
  SnsAccountInput,
  SocialHandles,
} from "@/lib/domain/types";
import { SOCIAL_PLATFORMS } from "@/lib/domain/types";
import { emptyBrandBrainInput } from "@/lib/brand/defaults";
import { sortPosts } from "@/lib/domain/posts";
import { getDemoStore, newId, persistDemoStore } from "./demo-store";
import {
  EMPTY_STRATEGY,
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
    return brain ? structuredClone({ ...brain, social: this.brandDefaultHandles(organizationId) }) : null;
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
    this.syncBrandDefaultAccounts(organizationId, input.social);
    // Mirror FK behaviour for removed locations (profiles cascade, references set null).
    const kept = new Set(this.locationIds(organizationId));
    store.locationProfiles = store.locationProfiles.filter((p) => p.organizationId !== organizationId || kept.has(p.locationId));
    store.accounts.forEach((a) => {
      if (a.organizationId === organizationId && a.locationId && !kept.has(a.locationId)) a.locationId = null;
    });
    store.hqCampaigns.forEach((c) => {
      if (c.organizationId === organizationId) c.targetLocationIds = c.targetLocationIds.filter((id) => kept.has(id));
    });
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
      accountId: this.ownedOrNull(organizationId, "account", input.accountId),
      locationId: this.ownedOrNull(organizationId, "location", input.locationId),
      hqCampaignId: this.ownedOrNull(organizationId, "campaign", input.hqCampaignId),
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

  // -------------------------------------------------------------------------
  // Accounts
  // -------------------------------------------------------------------------

  /** Equivalent of the assert_same_org_refs trigger. */
  private ownedOrNull(organizationId: ID, kind: "account" | "location" | "campaign", id: ID | null | undefined): ID | null {
    if (!id) return null;
    const store = getDemoStore();
    const ok =
      kind === "account"
        ? store.accounts.some((a) => a.id === id && a.organizationId === organizationId)
        : kind === "campaign"
          ? store.hqCampaigns.some((c) => c.id === id && c.organizationId === organizationId)
          : this.locationIds(organizationId).includes(id);
    if (!ok) throw new RepositoryError(`${kind} does not belong to organization`, "forbidden");
    return id;
  }

  private locationIds(organizationId: ID): ID[] {
    const brain = getDemoStore().brands.find((b) => b.organizationId === organizationId);
    return (brain?.locations ?? []).flatMap((l) => (l.id ? [l.id] : []));
  }

  private brandDefaultHandles(organizationId: ID): SocialHandles {
    const accounts = getDemoStore().accounts.filter((a) => a.organizationId === organizationId && a.isBrandDefault);
    const handle = (p: (typeof SOCIAL_PLATFORMS)[number]) => accounts.find((a) => a.platform === p)?.handle ?? "";
    return { instagram: handle("instagram"), threads: handle("threads"), tiktok: handle("tiktok"), facebook: handle("facebook") };
  }

  private syncBrandDefaultAccounts(organizationId: ID, social: SocialHandles): void {
    const store = getDemoStore();
    for (const platform of SOCIAL_PLATFORMS) {
      const handle = social[platform].trim();
      const existing = store.accounts.find(
        (a) => a.organizationId === organizationId && a.isBrandDefault && a.platform === platform,
      );
      if (!handle) {
        if (existing && existing.connectionStatus === "manual") store.accounts.splice(store.accounts.indexOf(existing), 1);
      } else if (existing) {
        existing.handle = handle;
      } else {
        store.accounts.push({
          id: newId(),
          organizationId,
          platform,
          handle,
          displayName: "",
          locationId: null,
          goal: "branding",
          strategy: { ...EMPTY_STRATEGY, kpis: [], contentPillars: [] },
          isBrandDefault: true,
          connectionStatus: "manual",
        });
      }
    }
  }

  async listAccounts(organizationId: ID): Promise<SnsAccount[]> {
    this.assertMember(organizationId);
    return getDemoStore()
      .accounts.filter((a) => a.organizationId === organizationId)
      .map(({ organizationId: _org, ...a }) => structuredClone(a));
  }

  async saveAccount(organizationId: ID, accountId: ID | null, input: SnsAccountInput): Promise<SnsAccount> {
    this.assertMember(organizationId, true);
    const locationId = input.locationId ? this.ownedOrNull(organizationId, "location", input.locationId) : null;
    const store = getDemoStore();
    let record = accountId ? store.accounts.find((a) => a.id === accountId && a.organizationId === organizationId) : undefined;
    if (accountId && !record) throw new RepositoryError("account not found", "not_found");
    if (record) {
      Object.assign(record, {
        ...structuredClone(input),
        platform: record.isBrandDefault ? record.platform : input.platform,
        locationId,
      });
    } else {
      record = { ...structuredClone(input), locationId, id: newId(), organizationId, isBrandDefault: false, connectionStatus: "manual" };
      store.accounts.push(record);
    }
    persistDemoStore();
    const { organizationId: _org, ...account } = record;
    return structuredClone(account);
  }

  async deleteAccount(organizationId: ID, accountId: ID): Promise<void> {
    this.assertMember(organizationId, true);
    const store = getDemoStore();
    store.accounts = store.accounts.filter((a) => !(a.id === accountId && a.organizationId === organizationId));
    store.posts.forEach((p) => {
      if (p.organizationId === organizationId && p.accountId === accountId) p.accountId = null;
    });
    persistDemoStore();
  }

  // -------------------------------------------------------------------------
  // Location customization
  // -------------------------------------------------------------------------

  async listLocationProfiles(organizationId: ID): Promise<LocationProfile[]> {
    this.assertMember(organizationId);
    const store = getDemoStore();
    const brain = store.brands.find((b) => b.organizationId === organizationId);
    return (brain?.locations ?? []).flatMap((l) => {
      if (!l.id) return [];
      const p = store.locationProfiles.find((x) => x.organizationId === organizationId && x.locationId === l.id);
      return [
        structuredClone({
          locationId: l.id,
          locationName: l.name,
          address: l.address,
          area: p?.area ?? "",
          demographics: p?.demographics ?? "",
          featuredServices: p?.featuredServices ?? [],
          staff: p?.staff ?? [],
          offers: p?.offers ?? [],
          localKeywords: p?.localKeywords ?? [],
        }),
      ];
    });
  }

  async saveLocationProfile(organizationId: ID, locationId: ID, input: LocationProfileInput): Promise<LocationProfile> {
    this.assertMember(organizationId, true);
    this.ownedOrNull(organizationId, "location", locationId);
    const store = getDemoStore();
    store.locationProfiles = store.locationProfiles.filter(
      (x) => !(x.organizationId === organizationId && x.locationId === locationId),
    );
    store.locationProfiles.push({ ...structuredClone(input), organizationId, locationId });
    persistDemoStore();
    const saved = (await this.listLocationProfiles(organizationId)).find((p) => p.locationId === locationId);
    if (!saved) throw new RepositoryError("location not found", "not_found");
    return saved;
  }

  // -------------------------------------------------------------------------
  // HQ templates
  // -------------------------------------------------------------------------

  async listHqCampaigns(organizationId: ID): Promise<HqCampaign[]> {
    this.assertMember(organizationId);
    return getDemoStore()
      .hqCampaigns.filter((c) => c.organizationId === organizationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ organizationId: _org, ...c }) => structuredClone(c));
  }

  async saveHqCampaign(organizationId: ID, campaignId: ID | null, input: HqCampaignInput): Promise<HqCampaign> {
    this.assertMember(organizationId, true);
    input.targetLocationIds.forEach((id) => this.ownedOrNull(organizationId, "location", id));
    const store = getDemoStore();
    let record = campaignId ? store.hqCampaigns.find((c) => c.id === campaignId && c.organizationId === organizationId) : undefined;
    if (campaignId && !record) throw new RepositoryError("campaign not found", "not_found");
    if (record) Object.assign(record, structuredClone(input));
    else {
      record = { ...structuredClone(input), id: newId(), organizationId, createdAt: now() };
      store.hqCampaigns.push(record);
    }
    persistDemoStore();
    const { organizationId: _org, ...campaign } = record;
    return structuredClone(campaign);
  }

  async deleteHqCampaign(organizationId: ID, campaignId: ID): Promise<void> {
    this.assertMember(organizationId, true);
    const store = getDemoStore();
    store.hqCampaigns = store.hqCampaigns.filter((c) => !(c.id === campaignId && c.organizationId === organizationId));
    persistDemoStore();
  }
}
