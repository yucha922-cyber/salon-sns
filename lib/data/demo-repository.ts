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
  AccountGoal,
  ContentPillar,
  PlanItem,
  PlanProposal,
  PlanProposalInput,
  PlanProposalStatus,
  Recommendation,
  RecommendationInput,
  RecommendationStatus,
} from "@/lib/domain/types";
import { EMPTY_PLANNING, EMPTY_PUBLISHING, SOCIAL_PLATFORMS } from "@/lib/domain/types";
import { emptyConnection } from "@/lib/social/connection";
import { customPillarKey, SYSTEM_CONTENT_PILLARS } from "@/lib/brand/content-pillars";
import { emptyBrandBrainInput } from "@/lib/brand/defaults";
import { sortPosts } from "@/lib/domain/posts";
import { getDemoStore, newId, persistDemoStore } from "./demo-store";
import {
  EMPTY_STRATEGY,
  RepositoryError,
  type DataRepository,
  type PlanItemPatch,
  type PostPatch,
  type SaveBrandBrainOptions,
} from "./repository";

const now = () => new Date().toISOString();

export class DemoRepository implements DataRepository {
  readonly mode = "demo" as const;

  /** @param idGen id generator (deterministic for the shared demo seed) */
  constructor(
    readonly userId: ID,
    private readonly idGen: () => ID = newId,
    /** system = background worker (no session): skips the membership check, like the service role. */
    private readonly options: { system?: boolean } = {},
  ) {}

  /** Tenant guard: equivalent of RLS for the in-memory store. */
  private assertMember(organizationId: ID, write = false): void {
    if (this.options.system) {
      if (!getDemoStore().organizations.some((o) => o.id === organizationId)) throw new RepositoryError("organization not found", "not_found");
      return;
    }
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
        return organization ? [{ organization: { ...organization, timezone: organization.timezone ?? "Asia/Tokyo" }, role: m.role, locationIds: m.locationIds ?? null }] : [];
      })
      .sort((a, b) => a.organization.createdAt.localeCompare(b.organization.createdAt));
  }

  async createOrganization(name: string, options?: { isDemo?: boolean }): Promise<Organization> {
    const store = getDemoStore();
    const organization: Organization = {
      id: this.idGen(),
      name: name.trim(),
      isDemo: options?.isDemo ?? false,
      createdAt: now(),
      timezone: "Asia/Tokyo",
    };
    store.organizations.push(organization);
    store.members.push({ organizationId: organization.id, userId: this.userId, role: "owner" });
    store.brands.push({
      ...emptyBrandBrainInput(),
      companyName: organization.name,
      brandName: organization.name,
      brandId: this.idGen(),
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
      locations: input.locations.map((l) => ({ ...l, id: l.id ?? this.idGen() })),
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
      id: this.idGen(),
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
      planning: { ...EMPTY_PLANNING, ...input.planning, planItemId: this.ownedPlanItemOrNull(organizationId, input.planning?.planItemId) },
      publishing: { ...EMPTY_PUBLISHING },
    };
    getDemoStore().posts.push(post);
    persistDemoStore();
    return structuredClone(post);
  }

  async updatePost(organizationId: ID, postId: ID, patch: PostPatch): Promise<Post> {
    this.assertMember(organizationId, true);
    const post = getDemoStore().posts.find((p) => p.id === postId && p.organizationId === organizationId);
    if (!post) throw new RepositoryError("post not found", "not_found");
    // Mirrors the posts_guard_publishing_state trigger: queued content is frozen.
    if ((post.status === "queued" || post.status === "publishing") && Object.values(patch).some((v) => v !== undefined)) {
      throw new RepositoryError("cancel the scheduled publish before editing", "forbidden");
    }
    if (patch.status === "queued" || patch.status === "publishing") throw new RepositoryError("publishing state is managed by the server", "forbidden");
    const { accountId, ...rest } = patch;
    Object.assign(post, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)));
    if (accountId !== undefined) {
      post.accountId = this.ownedOrNull(organizationId, "account", accountId);
      const account = getDemoStore().accounts.find((a) => a.id === post.accountId);
      if (account) post.locationId = account.locationId;
    }
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
    const record = { id: this.idGen(), organizationId, userId: this.userId, title, updatedAt: now(), messages: [] };
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
    const saved: ChatMessage = { id: this.idGen(), role: message.role, content: message.content, createdAt: now() };
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
          id: this.idGen(),
          organizationId,
          platform,
          handle,
          displayName: "",
          locationId: null,
          goal: "branding",
          customGoal: "",
          active: true,
          strategy: structuredClone({ ...EMPTY_STRATEGY, kpiTargets: [], contentPillars: [], preferredPostingDays: [], preferredPostingTimes: [] }),
          isBrandDefault: true,
          connectionStatus: "manual",
          connection: emptyConnection(),
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
      const created = { ...structuredClone(input), locationId, id: this.idGen(), organizationId, isBrandDefault: false, connectionStatus: "manual" as const, connection: emptyConnection() };
      store.accounts.push(created);
      record = created;
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
    // Mirror FKs: proposals cascade, recommendations keep the row.
    store.planProposals = store.planProposals.filter((p) => !(p.organizationId === organizationId && p.accountId === accountId));
    store.recommendations.forEach((r) => {
      if (r.organizationId === organizationId && r.socialAccountId === accountId) r.socialAccountId = null;
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
      record = { ...structuredClone(input), id: this.idGen(), organizationId, createdAt: now() };
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

  // -------------------------------------------------------------------------
  // Content pillars
  // -------------------------------------------------------------------------

  async listContentPillars(organizationId: ID): Promise<ContentPillar[]> {
    this.assertMember(organizationId);
    const custom = getDemoStore()
      .contentPillars.filter((p) => p.organizationId === organizationId)
      .map(({ organizationId: _org, ...p }) => p);
    return structuredClone([...SYSTEM_CONTENT_PILLARS, ...custom]);
  }

  async createContentPillar(
    organizationId: ID,
    input: { goal: AccountGoal; label: string; description: string },
  ): Promise<ContentPillar> {
    this.assertMember(organizationId, true);
    const store = getDemoStore();
    const key = customPillarKey(input.label);
    const existing = store.contentPillars.find((p) => p.organizationId === organizationId && p.key === key);
    if (existing) {
      const { organizationId: _org, ...pillar } = existing;
      return structuredClone(pillar);
    }
    const pillar: ContentPillar = { id: this.idGen(), key, label: input.label, goal: input.goal, description: input.description, isSystem: false };
    store.contentPillars.push({ ...pillar, organizationId });
    persistDemoStore();
    return structuredClone(pillar);
  }

  // -------------------------------------------------------------------------
  // Plan proposals
  // -------------------------------------------------------------------------

  private ownedPlanItemOrNull(organizationId: ID, itemId: ID | null | undefined): ID | null {
    if (!itemId) return null;
    const ok = getDemoStore().planProposals.some((p) => p.organizationId === organizationId && p.items.some((i) => i.id === itemId));
    if (!ok) throw new RepositoryError("plan item does not belong to organization", "forbidden");
    return itemId;
  }

  async createPlanProposal(organizationId: ID, input: PlanProposalInput): Promise<PlanProposal> {
    this.assertMember(organizationId, true);
    this.ownedOrNull(organizationId, "account", input.accountId);
    this.ownedOrNull(organizationId, "location", input.locationId);
    this.ownedOrNull(organizationId, "campaign", input.hqCampaignId);
    const proposal: PlanProposal = {
      ...structuredClone(input),
      id: this.idGen(),
      status: "pending",
      createdAt: now(),
      items: input.items.map((item) => ({ ...structuredClone(item), id: this.idGen(), status: "pending", postId: null })),
    };
    getDemoStore().planProposals.push({ ...proposal, organizationId });
    persistDemoStore();
    return structuredClone(proposal);
  }

  async listPlanProposals(organizationId: ID): Promise<Omit<PlanProposal, "items">[]> {
    this.assertMember(organizationId);
    return getDemoStore()
      .planProposals.filter((p) => p.organizationId === organizationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ organizationId: _org, items: _items, ...p }) => structuredClone(p));
  }

  async getPlanProposal(organizationId: ID, proposalId: ID): Promise<PlanProposal | null> {
    this.assertMember(organizationId);
    const p = getDemoStore().planProposals.find((x) => x.id === proposalId && x.organizationId === organizationId);
    if (!p) return null;
    const { organizationId: _org, ...proposal } = p;
    return structuredClone(proposal);
  }

  async updatePlanItem(organizationId: ID, itemId: ID, patch: PlanItemPatch): Promise<PlanItem> {
    this.assertMember(organizationId, true);
    const proposal = getDemoStore().planProposals.find((p) => p.organizationId === organizationId && p.items.some((i) => i.id === itemId));
    const item = proposal?.items.find((i) => i.id === itemId);
    if (!item) throw new RepositoryError("plan item not found", "not_found");
    Object.assign(item, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    persistDemoStore();
    return structuredClone(item);
  }

  async setPlanProposalStatus(organizationId: ID, proposalId: ID, status: PlanProposalStatus): Promise<void> {
    this.assertMember(organizationId, true);
    const p = getDemoStore().planProposals.find((x) => x.id === proposalId && x.organizationId === organizationId);
    if (!p) throw new RepositoryError("proposal not found", "not_found");
    p.status = status;
    persistDemoStore();
  }

  // -------------------------------------------------------------------------
  // Recommendations
  // -------------------------------------------------------------------------

  async listRecommendations(organizationId: ID): Promise<Recommendation[]> {
    this.assertMember(organizationId);
    return structuredClone(
      getDemoStore()
        .recommendations.filter((r) => r.organizationId === organizationId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async createRecommendations(organizationId: ID, inputs: RecommendationInput[]): Promise<Recommendation[]> {
    this.assertMember(organizationId, true);
    const created = inputs.map((input) => {
      this.ownedOrNull(organizationId, "location", input.locationId);
      this.ownedOrNull(organizationId, "account", input.socialAccountId);
      const rec: Recommendation = { source: "operations", sourcePostIds: [], ...structuredClone(input), id: this.idGen(), organizationId, status: "pending", createdAt: now() };
      return rec;
    });
    getDemoStore().recommendations.push(...created);
    persistDemoStore();
    return structuredClone(created);
  }

  async setRecommendationStatus(organizationId: ID, recommendationId: ID, status: RecommendationStatus): Promise<Recommendation> {
    this.assertMember(organizationId, true);
    const rec = getDemoStore().recommendations.find((r) => r.id === recommendationId && r.organizationId === organizationId);
    if (!rec) throw new RepositoryError("recommendation not found", "not_found");
    rec.status = status;
    persistDemoStore();
    return structuredClone(rec);
  }
}
