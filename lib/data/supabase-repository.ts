import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import type {
  BrandBrain,
  BrandBrainInput,
  ChatMessage,
  Conversation,
  ContentType,
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
  AccountGoal,
  ContentPillar,
  KpiTarget,
  PlanItem,
  PlanProposal,
  PlanProposalInput,
  PlanProposalStatus,
  Recommendation,
  RecommendationInput,
  RecommendationStatus,
} from "@/lib/domain/types";
import { ACCOUNT_GOALS, EMPTY_PLANNING, SOCIAL_PLATFORMS } from "@/lib/domain/types";
import { customPillarKey } from "@/lib/brand/content-pillars";
import { CONTENT_TYPES } from "@/lib/domain/types";
import { sortPosts } from "@/lib/domain/posts";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import type { SocialConnectionInfo } from "@/lib/social/types";
import type {
  AiPlanProposalItemRow,
  AiPlanProposalRow,
  AiRecommendationRow,
  ContentPillarRow,
  AccountStrategyRow,
  HqCampaignRow,
  Json,
  OrganizationRow,
  SocialAccountRow,
  PostRow,
  PostScheduleRow,
  SocialPlatformEnum,
} from "@/lib/supabase/database.types";
import {
  RepositoryError,
  type DataRepository,
  type PlanItemPatch,
  type PostPatch,
  type SaveBrandBrainOptions,
} from "./repository";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(error: PostgrestError | null, context: string): void {
  if (!error) return;
  const code = error.code === "42501" ? "forbidden" : error.code === "PGRST116" ? "not_found" : "unknown";
  throw new RepositoryError(`${context}: ${error.message}`, code);
}

function toOrganization(row: OrganizationRow): Organization {
  return { id: row.id, name: row.name, isDemo: row.is_demo, createdAt: row.created_at, timezone: row.timezone ?? "Asia/Tokyo" };
}

function toContentType(value: string): ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(value) ? (value as ContentType) : "feed";
}

function toPost(row: PostRow, schedule: Pick<PostScheduleRow, "scheduled_at"> | undefined): Post {
  return {
    id: row.id,
    organizationId: row.organization_id,
    platform: row.platform === "instagram" || row.platform === "threads" || row.platform === "tiktok" || row.platform === "facebook"
      ? row.platform
      : "instagram",
    contentType: toContentType(row.content_type),
    title: row.title,
    caption: row.caption,
    cta: row.cta,
    hashtags: row.hashtags,
    status: row.status,
    source: row.source,
    scheduledAt: schedule?.scheduled_at ?? null,
    createdAt: row.created_at,
    accountId: row.social_account_id,
    locationId: row.location_id,
    hqCampaignId: row.hq_campaign_id,
    planning: {
      theme: row.theme,
      hook: row.hook,
      summary: row.summary,
      goal: toGoal(row.goal),
      target: row.target,
      contentPillar: row.content_pillar,
      funnelStage: row.funnel_stage,
      planItemId: row.plan_proposal_item_id,
    },
    publishing: {
      approvedAt: row.approved_at,
      approvedBy: row.approved_by,
      publishedAt: row.published_at,
      providerPostId: row.provider_post_id,
      permalink: row.permalink,
      error: row.publish_error,
    },
  };
}

export function toConnectionInfo(row: SocialAccountRow): SocialConnectionInfo {
  const meta = row.provider_metadata && typeof row.provider_metadata === "object" && !Array.isArray(row.provider_metadata) ? row.provider_metadata : {};
  return {
    status: row.connection_status,
    externalAccountId: row.external_account_id,
    username: row.username ?? "",
    profileImageUrl: row.profile_image_url,
    tokenExpiresAt: row.token_expires_at,
    scopes: row.scopes ?? [],
    connectedAt: row.connected_at,
    lastSyncedAt: row.last_synced_at,
    error: row.connection_error,
    metadata: Object.fromEntries(
      Object.entries(meta).filter((e): e is [string, string | number | boolean | null] => ["string", "number", "boolean"].includes(typeof e[1]) || e[1] === null),
    ),
  };
}

function toGoal(value: string | null): AccountGoal | null {
  return ACCOUNT_GOALS.find((g) => g === value) ?? null;
}

function toKpiTargets(value: unknown): KpiTarget[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v: unknown) => {
    if (typeof v !== "object" || v === null || !("metric" in v) || typeof v.metric !== "string") return [];
    const target = "target" in v && typeof v.target === "number" ? v.target : null;
    const unit = "unit" in v && typeof v.unit === "string" ? v.unit : "";
    return [{ metric: v.metric, target, unit }];
  });
}

function toPlanItem(row: AiPlanProposalItemRow): PlanItem {
  return {
    id: row.id,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time.slice(0, 5),
    platform: SOCIAL_PLATFORMS.find((p) => p === row.platform) ?? "instagram",
    contentType: CONTENT_TYPES.find((c) => c === row.content_type) ?? "feed",
    theme: row.theme,
    hook: row.hook,
    summary: row.summary,
    goal: toGoal(row.goal) ?? "custom",
    target: row.target,
    contentPillar: row.content_pillar,
    funnelStage: row.funnel_stage,
    cta: row.cta,
    status: row.status,
    postId: row.post_id,
  };
}

function toProposal(row: AiPlanProposalRow): Omit<PlanProposal, "items"> {
  return {
    id: row.id,
    accountId: row.social_account_id,
    locationId: row.location_id,
    hqCampaignId: row.hq_campaign_id,
    month: row.month.slice(0, 7),
    goal: toGoal(row.goal) ?? "custom",
    summary: row.summary,
    aiProvider: row.ai_provider ?? "",
    status: row.status,
    createdAt: row.created_at,
  };
}

function toRecommendation(row: AiRecommendationRow): Recommendation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    locationId: row.location_id,
    socialAccountId: row.social_account_id,
    category: row.category,
    severity: row.severity,
    title: row.title,
    observation: row.observation,
    insight: row.insight,
    hypothesis: row.hypothesis,
    recommendedAction: row.recommended_action,
    expectedImpact: row.expected_impact,
    confidence: Number(row.confidence),
    status: row.status,
    createdAt: row.created_at,
    source: row.source ?? "operations",
    sourcePostIds: row.source_post_ids ?? [],
  };
}

function toPillar(row: ContentPillarRow): ContentPillar {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    goal: row.goal,
    description: row.description,
    isSystem: row.organization_id === null,
  };
}

const APP_PLATFORMS = ["instagram", "threads", "tiktok", "facebook"] as const;

function toAccount(row: SocialAccountRow, strategy: AccountStrategyRow | undefined): SnsAccount | null {
  const platform = APP_PLATFORMS.find((p) => p === row.platform);
  if (!platform) return null;
  return {
    id: row.id,
    platform,
    handle: row.handle,
    displayName: row.display_name,
    locationId: row.location_id,
    goal: row.goal,
    customGoal: row.custom_goal,
    active: row.active,
    isBrandDefault: row.is_brand_default,
    connectionStatus: row.connection_status,
    connection: toConnectionInfo(row),
    strategy: {
      targetAudience: strategy?.target_audience ?? "",
      persona: strategy?.persona ?? "",
      kpiTargets: toKpiTargets(strategy?.kpi_targets),
      contentPillars: strategy?.content_pillars ?? [],
      postsPerWeek: strategy?.posts_per_week ?? 3,
      postingFrequencyNote: strategy?.posting_frequency_note ?? "",
      preferredPostingDays: strategy?.preferred_posting_days ?? [],
      preferredPostingTimes: strategy?.preferred_posting_times ?? [],
      cta: strategy?.cta ?? "",
      tone: strategy?.tone ?? "",
      notes: strategy?.notes ?? "",
    },
  };
}

function toHqCampaign(row: HqCampaignRow): HqCampaign {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    sharedTheme: row.shared_theme,
    creative: { headline: row.creative_headline, body: row.creative_body, visual: row.creative_visual },
    localizationRules: row.localization_rules,
    targetLocationIds: row.target_location_ids,
    goal: row.goal,
    targetPlatforms: row.target_platforms.flatMap((p) => SOCIAL_PLATFORMS.filter((x) => x === p)),
    contentDirections: row.content_directions,
    requiredMessages: row.required_messages,
    optionalMessages: row.optional_messages,
    cta: row.cta,
    createdAt: row.created_at,
  };
}

function planningColumns(p: import("@/lib/domain/types").PostPlanning) {
  return {
    theme: p.theme,
    hook: p.hook,
    summary: p.summary,
    goal: p.goal,
    target: p.target,
    content_pillar: p.contentPillar,
    funnel_stage: p.funnelStage,
    plan_proposal_item_id: p.planItemId,
  };
}

/**
 * Postgres-backed repository. Runs every query with the signed-in user's JWT,
 * so tenant isolation is enforced by RLS (see supabase/migrations).
 */
export class SupabaseRepository implements DataRepository {
  readonly mode = "supabase" as const;

  constructor(
    private readonly db: ServerSupabaseClient,
    readonly userId: ID,
  ) {}

  async listMemberships(): Promise<OrganizationMembership[]> {
    const { data: members, error } = await this.db
      .from("organization_members")
      .select("organization_id, role, location_ids")
      .eq("user_id", this.userId);
    fail(error, "listMemberships");
    if (!members?.length) return [];
    const { data: orgs, error: orgError } = await this.db
      .from("organizations")
      .select("*")
      .in(
        "id",
        members.map((m) => m.organization_id),
      )
      .order("created_at");
    fail(orgError, "listMemberships.organizations");
    return (orgs ?? []).map((row) => ({
      organization: toOrganization(row),
      role: members.find((m) => m.organization_id === row.id)?.role ?? "viewer",
      locationIds: members.find((m) => m.organization_id === row.id)?.location_ids ?? null,
    }));
  }

  async createOrganization(name: string, options?: { isDemo?: boolean }): Promise<Organization> {
    const { data: id, error } = await this.db.rpc("create_organization", {
      p_name: name,
      p_is_demo: options?.isDemo ?? false,
    });
    fail(error, "createOrganization");
    if (!id) throw new RepositoryError("organization not created");
    const { data: row, error: readError } = await this.db.from("organizations").select("*").eq("id", id).single();
    fail(readError, "createOrganization.read");
    if (!row) throw new RepositoryError("organization not created");
    return toOrganization(row);
  }

  async renameOrganization(organizationId: ID, name: string): Promise<void> {
    const { error } = await this.db.from("organizations").update({ name }).eq("id", organizationId);
    fail(error, "renameOrganization");
  }

  private async getBrandRow(organizationId: ID) {
    const { data, error } = await this.db
      .from("brands")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    fail(error, "getBrand");
    return data;
  }

  async getBrandBrain(organizationId: ID): Promise<BrandBrain | null> {
    const brand = await this.getBrandRow(organizationId);
    if (!brand) return null;
    const byBrand = { brand_id: brand.id } as const;
    const [profile, audience, personas, services, competitors, locations, socials] = await Promise.all([
      this.db.from("business_profiles").select("*").match(byBrand).maybeSingle(),
      this.db.from("target_audiences").select("*").match(byBrand).eq("is_primary", true).order("created_at").limit(1).maybeSingle(),
      this.db.from("personas").select("*").match(byBrand).order("sort_order"),
      this.db.from("services").select("*").match(byBrand).order("sort_order"),
      this.db.from("competitors").select("*").match(byBrand).order("sort_order"),
      this.db.from("locations").select("*").match(byBrand).order("sort_order"),
      this.db.from("social_accounts").select("*").match(byBrand).eq("is_brand_default", true),
    ]);
    [profile, audience, personas, services, competitors, locations, socials].forEach((r) =>
      fail(r.error, "getBrandBrain"),
    );
    const handle = (platform: SocialPlatformEnum) =>
      socials.data?.find((s) => s.platform === platform)?.handle ?? "";
    const p = profile.data;
    const a = audience.data;
    return {
      brandId: brand.id,
      organizationId: brand.organization_id,
      companyName: p?.company_name ?? "",
      brandName: brand.name,
      industry: { key: brand.industry_key, label: brand.industry_label },
      businessDescription: brand.business_description,
      website: brand.website,
      social: {
        instagram: handle("instagram"),
        threads: handle("threads"),
        tiktok: handle("tiktok"),
        facebook: handle("facebook"),
      },
      locations: (locations.data ?? []).map((l) => ({ id: l.id, name: l.name, address: l.address })),
      services: (services.data ?? []).map((s) => ({
        name: s.name,
        description: s.description,
        price: s.price === null ? null : Number(s.price),
      })),
      serviceDescription: brand.service_description,
      strengths: p?.strengths ?? [],
      features: p?.features ?? [],
      competitors: (competitors.data ?? []).map((c) => ({ name: c.name, note: c.note })),
      differentiators: p?.differentiators ?? [],
      targetAudience: {
        summary: a?.summary ?? "",
        ageRange: a?.age_range ?? "",
        gender: a?.gender ?? "",
        occupation: a?.occupation ?? "",
        painPoints: a?.pain_points ?? [],
        useCases: a?.use_cases ?? [],
      },
      personas: (personas.data ?? []).map((x) => ({ name: x.name, description: x.description })),
      brandPersonality: brand.brand_personality,
      brandTone: brand.brand_tone,
      writingTone: brand.writing_tone,
      marketingGoals: p?.marketing_goals ?? "",
      socialGoals: p?.social_goals ?? "",
      advertisingGoals: p?.advertising_goals ?? "",
      aiContext: brand.ai_context,
      onboardingStep: brand.onboarding_step,
      onboardingCompletedAt: brand.onboarding_completed_at,
      updatedAt: brand.updated_at,
    };
  }

  async saveBrandBrain(
    organizationId: ID,
    input: BrandBrainInput,
    options: SaveBrandBrainOptions = {},
  ): Promise<BrandBrain> {
    const brand = await this.getBrandRow(organizationId);
    if (!brand) throw new RepositoryError("brand not found", "not_found");
    const payload = {
      ...input,
      // Only real DB ids are sent back; anything else becomes a new location.
      locations: input.locations.map((l) => ({ ...l, id: l.id && UUID_RE.test(l.id) ? l.id : undefined })),
      onboardingStep: options.onboardingStep ?? 0,
      completeOnboarding: options.completeOnboarding ?? false,
    };
    const { error } = await this.db.rpc("save_brand_brain", {
      p_brand_id: brand.id,
      p: JSON.parse(JSON.stringify(payload)) as Json,
    });
    fail(error, "saveBrandBrain");
    const saved = await this.getBrandBrain(organizationId);
    if (!saved) throw new RepositoryError("brand not found after save", "not_found");
    return saved;
  }

  async listPosts(organizationId: ID): Promise<Post[]> {
    const [posts, schedules] = await Promise.all([
      this.db.from("posts").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(500),
      this.db
        .from("post_schedules")
        .select("post_id, scheduled_at")
        .eq("organization_id", organizationId)
        .neq("status", "cancelled"),
    ]);
    fail(posts.error, "listPosts");
    fail(schedules.error, "listPosts.schedules");
    return sortPosts((posts.data ?? []).map((row) => toPost(row, schedules.data?.find((s) => s.post_id === row.id))));
  }

  async createPost(organizationId: ID, input: NewPostInput): Promise<Post> {
    const brand = await this.getBrandRow(organizationId);
    const { data: row, error } = await this.db
      .from("posts")
      .insert({
        organization_id: organizationId,
        brand_id: brand?.id ?? null,
        platform: input.platform,
        content_type: input.contentType,
        title: input.title,
        caption: input.caption,
        cta: input.cta,
        hashtags: input.hashtags,
        status: input.status,
        source: input.source,
        generation_input: input.generationInput ?? null,
        ai_provider: input.aiProvider ?? null,
        created_by: this.userId,
        social_account_id: input.accountId ?? null,
        location_id: input.locationId ?? null,
        hq_campaign_id: input.hqCampaignId ?? null,
        ...planningColumns({ ...EMPTY_PLANNING, ...input.planning }),
      })
      .select("*")
      .single();
    fail(error, "createPost");
    if (!row) throw new RepositoryError("post not created");
    let schedule: { scheduled_at: string } | undefined;
    if (input.scheduledAt) {
      const { data, error: scheduleError } = await this.db
        .from("post_schedules")
        .insert({ organization_id: organizationId, post_id: row.id, scheduled_at: input.scheduledAt })
        .select("scheduled_at")
        .single();
      fail(scheduleError, "createPost.schedule");
      schedule = data ?? undefined;
    }
    return toPost(row, schedule);
  }

  async updatePost(organizationId: ID, postId: ID, patch: PostPatch): Promise<Post> {
    const { data: row, error } = await this.db
      .from("posts")
      .update({
        title: patch.title,
        caption: patch.caption,
        cta: patch.cta,
        hashtags: patch.hashtags,
        status: patch.status,
        ...(patch.accountId !== undefined ? { social_account_id: patch.accountId, location_id: await this.accountLocation(organizationId, patch.accountId) } : {}),
      })
      .eq("id", postId)
      .eq("organization_id", organizationId)
      .select("*")
      .single();
    fail(error, "updatePost");
    if (!row) throw new RepositoryError("post not found", "not_found");
    if (patch.scheduledAt !== undefined) {
      const { error: cancelError } = await this.db
        .from("post_schedules")
        .update({ status: "cancelled" })
        .eq("post_id", postId)
        .neq("status", "cancelled");
      fail(cancelError, "updatePost.cancelSchedule");
      if (patch.scheduledAt) {
        const { error: scheduleError } = await this.db
          .from("post_schedules")
          .insert({ organization_id: organizationId, post_id: postId, scheduled_at: patch.scheduledAt });
        fail(scheduleError, "updatePost.schedule");
      }
    }
    const { data: schedule } = await this.db
      .from("post_schedules")
      .select("scheduled_at")
      .eq("post_id", postId)
      .neq("status", "cancelled")
      .maybeSingle();
    return toPost(row, schedule ?? undefined);
  }

  private async accountLocation(organizationId: ID, accountId: ID | null): Promise<string | null> {
    if (!accountId) return null;
    const { data } = await this.db.from("social_accounts").select("location_id").eq("organization_id", organizationId).eq("id", accountId).maybeSingle();
    return data?.location_id ?? null;
  }

  async listConversations(organizationId: ID): Promise<Omit<Conversation, "messages">[]> {
    const { data, error } = await this.db
      .from("ai_conversations")
      .select("id, title, updated_at")
      .eq("organization_id", organizationId)
      .eq("user_id", this.userId)
      .order("updated_at", { ascending: false })
      .limit(30);
    fail(error, "listConversations");
    return (data ?? []).map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at }));
  }

  async getConversation(organizationId: ID, conversationId: ID): Promise<Conversation | null> {
    if (!UUID_RE.test(conversationId)) return null;
    const { data: c, error } = await this.db
      .from("ai_conversations")
      .select("id, title, updated_at")
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .eq("user_id", this.userId)
      .maybeSingle();
    fail(error, "getConversation");
    if (!c) return null;
    const { data: messages, error: msgError } = await this.db
      .from("ai_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", c.id)
      .order("created_at");
    fail(msgError, "getConversation.messages");
    return {
      id: c.id,
      title: c.title,
      updatedAt: c.updated_at,
      messages: (messages ?? []).map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.created_at })),
    };
  }

  async createConversation(organizationId: ID, title: string): Promise<Omit<Conversation, "messages">> {
    const brand = await this.getBrandRow(organizationId);
    const { data, error } = await this.db
      .from("ai_conversations")
      .insert({ organization_id: organizationId, brand_id: brand?.id ?? null, user_id: this.userId, title })
      .select("id, title, updated_at")
      .single();
    fail(error, "createConversation");
    if (!data) throw new RepositoryError("conversation not created");
    return { id: data.id, title: data.title, updatedAt: data.updated_at };
  }

  async appendMessage(
    organizationId: ID,
    conversationId: ID,
    message: { role: ChatMessage["role"]; content: string; aiProvider?: string },
  ): Promise<ChatMessage> {
    const { data, error } = await this.db
      .from("ai_messages")
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        role: message.role,
        content: message.content,
        ai_provider: message.aiProvider ?? null,
      })
      .select("id, role, content, created_at")
      .single();
    fail(error, "appendMessage");
    if (!data) throw new RepositoryError("message not saved");
    // Touch the conversation so it sorts first.
    await this.db
      .from("ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);
    return { id: data.id, role: data.role, content: data.content, createdAt: data.created_at };
  }

  // -------------------------------------------------------------------------
  // Accounts
  // -------------------------------------------------------------------------

  async listAccounts(organizationId: ID): Promise<SnsAccount[]> {
    const [accounts, strategies] = await Promise.all([
      this.db.from("social_accounts").select("*").eq("organization_id", organizationId).order("created_at"),
      this.db.from("account_strategies").select("*").eq("organization_id", organizationId),
    ]);
    fail(accounts.error, "listAccounts");
    fail(strategies.error, "listAccounts.strategies");
    return (accounts.data ?? []).flatMap((row) => {
      const account = toAccount(row, strategies.data?.find((s) => s.social_account_id === row.id));
      return account ? [account] : [];
    });
  }

  async saveAccount(organizationId: ID, accountId: ID | null, input: SnsAccountInput): Promise<SnsAccount> {
    const brand = await this.getBrandRow(organizationId);
    if (!brand) throw new RepositoryError("brand not found", "not_found");
    const fields = {
      handle: input.handle,
      display_name: input.displayName,
      location_id: input.locationId,
      goal: input.goal,
      custom_goal: input.customGoal,
      active: input.active,
    };
    let row: SocialAccountRow | null;
    if (accountId) {
      // Brand-default accounts keep their platform (it mirrors the Brand Brain field).
      const { data: existing, error: readError } = await this.db
        .from("social_accounts").select("is_brand_default").eq("id", accountId).eq("organization_id", organizationId).maybeSingle();
      fail(readError, "saveAccount.read");
      if (!existing) throw new RepositoryError("account not found", "not_found");
      const { data, error } = await this.db
        .from("social_accounts")
        .update(existing.is_brand_default ? fields : { ...fields, platform: input.platform })
        .eq("id", accountId)
        .eq("organization_id", organizationId)
        .select("*")
        .single();
      fail(error, "saveAccount.update");
      row = data;
    } else {
      const { data, error } = await this.db
        .from("social_accounts")
        .insert({ ...fields, organization_id: organizationId, brand_id: brand.id, platform: input.platform, is_brand_default: false })
        .select("*")
        .single();
      fail(error, "saveAccount.insert");
      row = data;
    }
    if (!row) throw new RepositoryError("account not saved");
    const { data: strategy, error: strategyError } = await this.db
      .from("account_strategies")
      .upsert(
        {
          organization_id: organizationId,
          social_account_id: row.id,
          target_audience: input.strategy.targetAudience,
          persona: input.strategy.persona,
          kpis: input.strategy.kpiTargets.map((k) => k.metric),
          kpi_targets: input.strategy.kpiTargets.map((k) => ({ metric: k.metric, target: k.target, unit: k.unit })),
          content_pillars: input.strategy.contentPillars,
          posts_per_week: input.strategy.postsPerWeek,
          posting_frequency_note: input.strategy.postingFrequencyNote,
          preferred_posting_days: input.strategy.preferredPostingDays,
          preferred_posting_times: input.strategy.preferredPostingTimes,
          cta: input.strategy.cta,
          tone: input.strategy.tone,
          notes: input.strategy.notes,
        },
        { onConflict: "social_account_id" },
      )
      .select("*")
      .single();
    fail(strategyError, "saveAccount.strategy");
    const account = toAccount(row, strategy ?? undefined);
    if (!account) throw new RepositoryError("unsupported platform", "invalid");
    return account;
  }

  async deleteAccount(organizationId: ID, accountId: ID): Promise<void> {
    const { error } = await this.db.from("social_accounts").delete().eq("id", accountId).eq("organization_id", organizationId);
    fail(error, "deleteAccount");
  }

  // -------------------------------------------------------------------------
  // Location customization
  // -------------------------------------------------------------------------

  async listLocationProfiles(organizationId: ID): Promise<LocationProfile[]> {
    const brand = await this.getBrandRow(organizationId);
    if (!brand) return [];
    const [locations, profiles, staff] = await Promise.all([
      this.db.from("locations").select("*").eq("brand_id", brand.id).order("sort_order"),
      this.db.from("location_profiles").select("*").eq("organization_id", organizationId),
      this.db.from("location_staff").select("*").eq("organization_id", organizationId).order("sort_order"),
    ]);
    [locations, profiles, staff].forEach((r) => fail(r.error, "listLocationProfiles"));
    return (locations.data ?? []).map((l) => {
      const p = profiles.data?.find((x) => x.location_id === l.id);
      return {
        locationId: l.id,
        locationName: l.name,
        address: l.address,
        area: p?.area ?? "",
        demographics: p?.demographics ?? "",
        featuredServices: p?.featured_services ?? [],
        offers: p?.offers ?? [],
        localKeywords: p?.local_keywords ?? [],
        staff: (staff.data ?? [])
          .filter((s) => s.location_id === l.id)
          .map((s) => ({ name: s.name, role: s.role, specialty: s.specialty })),
      };
    });
  }

  async saveLocationProfile(organizationId: ID, locationId: ID, input: LocationProfileInput): Promise<LocationProfile> {
    const { error } = await this.db.from("location_profiles").upsert(
      {
        organization_id: organizationId,
        location_id: locationId,
        area: input.area,
        demographics: input.demographics,
        featured_services: input.featuredServices,
        offers: input.offers,
        local_keywords: input.localKeywords,
      },
      { onConflict: "location_id" },
    );
    fail(error, "saveLocationProfile");
    const { error: deleteError } = await this.db
      .from("location_staff").delete().eq("location_id", locationId).eq("organization_id", organizationId);
    fail(deleteError, "saveLocationProfile.staff.delete");
    if (input.staff.length) {
      const { error: staffError } = await this.db.from("location_staff").insert(
        input.staff.map((s, i) => ({ organization_id: organizationId, location_id: locationId, ...s, sort_order: i })),
      );
      fail(staffError, "saveLocationProfile.staff");
    }
    const saved = (await this.listLocationProfiles(organizationId)).find((p) => p.locationId === locationId);
    if (!saved) throw new RepositoryError("location not found", "not_found");
    return saved;
  }

  // -------------------------------------------------------------------------
  // HQ templates
  // -------------------------------------------------------------------------

  async listHqCampaigns(organizationId: ID): Promise<HqCampaign[]> {
    const { data, error } = await this.db
      .from("hq_campaigns").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false });
    fail(error, "listHqCampaigns");
    return (data ?? []).map(toHqCampaign);
  }

  async saveHqCampaign(organizationId: ID, campaignId: ID | null, input: HqCampaignInput): Promise<HqCampaign> {
    const brand = await this.getBrandRow(organizationId);
    const fields = {
      name: input.name,
      status: input.status,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      shared_theme: input.sharedTheme,
      creative_headline: input.creative.headline,
      creative_body: input.creative.body,
      creative_visual: input.creative.visual,
      localization_rules: input.localizationRules,
      target_location_ids: input.targetLocationIds.filter((id) => UUID_RE.test(id)),
      goal: input.goal,
      target_platforms: input.targetPlatforms,
      content_directions: input.contentDirections,
      required_messages: input.requiredMessages,
      optional_messages: input.optionalMessages,
      cta: input.cta,
    };
    const query = campaignId
      ? this.db.from("hq_campaigns").update(fields).eq("id", campaignId).eq("organization_id", organizationId)
      : this.db.from("hq_campaigns").insert({ ...fields, organization_id: organizationId, brand_id: brand?.id ?? null, created_by: this.userId });
    const { data, error } = await query.select("*").single();
    fail(error, "saveHqCampaign");
    if (!data) throw new RepositoryError("campaign not saved");
    return toHqCampaign(data);
  }

  async deleteHqCampaign(organizationId: ID, campaignId: ID): Promise<void> {
    const { error } = await this.db.from("hq_campaigns").delete().eq("id", campaignId).eq("organization_id", organizationId);
    fail(error, "deleteHqCampaign");
  }

  // -------------------------------------------------------------------------
  // Content pillars
  // -------------------------------------------------------------------------

  async listContentPillars(organizationId: ID): Promise<ContentPillar[]> {
    // RLS returns system presets (organization_id null) + this organization's pillars.
    const { data, error } = await this.db
      .from("content_pillars")
      .select("*")
      .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
      .order("goal")
      .order("sort_order");
    fail(error, "listContentPillars");
    return (data ?? []).map(toPillar);
  }

  async createContentPillar(
    organizationId: ID,
    input: { goal: AccountGoal; label: string; description: string },
  ): Promise<ContentPillar> {
    const key = customPillarKey(input.label);
    const { data, error } = await this.db
      .from("content_pillars")
      .upsert(
        { organization_id: organizationId, goal: input.goal, key, label: input.label, description: input.description },
        { onConflict: "organization_id,key", ignoreDuplicates: false },
      )
      .select("*")
      .single();
    fail(error, "createContentPillar");
    if (!data) throw new RepositoryError("pillar not saved");
    return toPillar(data);
  }

  // -------------------------------------------------------------------------
  // Plan proposals
  // -------------------------------------------------------------------------

  async createPlanProposal(organizationId: ID, input: PlanProposalInput): Promise<PlanProposal> {
    const { data: row, error } = await this.db
      .from("ai_plan_proposals")
      .insert({
        organization_id: organizationId,
        social_account_id: input.accountId,
        location_id: input.locationId,
        hq_campaign_id: input.hqCampaignId,
        month: `${input.month}-01`,
        goal: input.goal,
        summary: input.summary,
        ai_provider: input.aiProvider,
        created_by: this.userId,
      })
      .select("*")
      .single();
    fail(error, "createPlanProposal");
    if (!row) throw new RepositoryError("proposal not saved");
    const { data: items, error: itemsError } = await this.db
      .from("ai_plan_proposal_items")
      .insert(
        input.items.map((item, i) => ({
          organization_id: organizationId,
          proposal_id: row.id,
          scheduled_date: item.scheduledDate,
          scheduled_time: item.scheduledTime,
          platform: item.platform,
          content_type: item.contentType,
          theme: item.theme,
          hook: item.hook,
          summary: item.summary,
          goal: item.goal,
          target: item.target,
          content_pillar: item.contentPillar,
          funnel_stage: item.funnelStage,
          cta: item.cta,
          sort_order: i,
        })),
      )
      .select("*");
    fail(itemsError, "createPlanProposal.items");
    return { ...toProposal(row), items: (items ?? []).sort((a, b) => a.sort_order - b.sort_order).map(toPlanItem) };
  }

  async listPlanProposals(organizationId: ID): Promise<Omit<PlanProposal, "items">[]> {
    const { data, error } = await this.db
      .from("ai_plan_proposals")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50);
    fail(error, "listPlanProposals");
    return (data ?? []).map(toProposal);
  }

  async getPlanProposal(organizationId: ID, proposalId: ID): Promise<PlanProposal | null> {
    if (!UUID_RE.test(proposalId)) return null;
    const { data: row, error } = await this.db
      .from("ai_plan_proposals")
      .select("*")
      .eq("id", proposalId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    fail(error, "getPlanProposal");
    if (!row) return null;
    const { data: items, error: itemsError } = await this.db
      .from("ai_plan_proposal_items")
      .select("*")
      .eq("proposal_id", row.id)
      .order("sort_order");
    fail(itemsError, "getPlanProposal.items");
    return { ...toProposal(row), items: (items ?? []).map(toPlanItem) };
  }

  async updatePlanItem(organizationId: ID, itemId: ID, patch: PlanItemPatch): Promise<PlanItem> {
    // undefined keys are dropped by JSON serialization → only provided fields change
    const columns: Partial<AiPlanProposalItemRow> = {
      scheduled_date: patch.scheduledDate,
      scheduled_time: patch.scheduledTime,
      platform: patch.platform,
      content_type: patch.contentType,
      theme: patch.theme,
      hook: patch.hook,
      summary: patch.summary,
      goal: patch.goal,
      target: patch.target,
      content_pillar: patch.contentPillar,
      funnel_stage: patch.funnelStage,
      cta: patch.cta,
      status: patch.status,
      post_id: patch.postId,
    };
    const { data, error } = await this.db
      .from("ai_plan_proposal_items")
      .update(columns)
      .eq("id", itemId)
      .eq("organization_id", organizationId)
      .select("*")
      .single();
    fail(error, "updatePlanItem");
    if (!data) throw new RepositoryError("plan item not found", "not_found");
    return toPlanItem(data);
  }

  async setPlanProposalStatus(organizationId: ID, proposalId: ID, status: PlanProposalStatus): Promise<void> {
    const { error } = await this.db
      .from("ai_plan_proposals")
      .update({ status })
      .eq("id", proposalId)
      .eq("organization_id", organizationId);
    fail(error, "setPlanProposalStatus");
  }

  // -------------------------------------------------------------------------
  // Recommendations
  // -------------------------------------------------------------------------

  async listRecommendations(organizationId: ID): Promise<Recommendation[]> {
    const { data, error } = await this.db
      .from("ai_recommendations")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100);
    fail(error, "listRecommendations");
    return (data ?? []).map(toRecommendation);
  }

  async createRecommendations(organizationId: ID, inputs: RecommendationInput[]): Promise<Recommendation[]> {
    if (!inputs.length) return [];
    const brand = await this.getBrandRow(organizationId);
    const { data, error } = await this.db
      .from("ai_recommendations")
      .insert(
        inputs.map((r) => ({
          organization_id: organizationId,
          brand_id: brand?.id ?? null,
          location_id: r.locationId,
          social_account_id: r.socialAccountId,
          category: r.category,
          severity: r.severity,
          title: r.title,
          observation: r.observation,
          insight: r.insight,
          hypothesis: r.hypothesis,
          recommended_action: r.recommendedAction,
          expected_impact: r.expectedImpact,
          confidence: r.confidence,
          source: r.source ?? "operations",
          source_post_ids: r.sourcePostIds ?? [],
        })),
      )
      .select("*");
    fail(error, "createRecommendations");
    return (data ?? []).map(toRecommendation);
  }

  async setRecommendationStatus(organizationId: ID, recommendationId: ID, status: RecommendationStatus): Promise<Recommendation> {
    const { data, error } = await this.db
      .from("ai_recommendations")
      .update({ status, decided_by: this.userId, decided_at: new Date().toISOString() })
      .eq("id", recommendationId)
      .eq("organization_id", organizationId)
      .select("*")
      .single();
    fail(error, "setRecommendationStatus");
    if (!data) throw new RepositoryError("recommendation not found", "not_found");
    return toRecommendation(data);
  }
}
