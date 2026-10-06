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
  Organization,
  OrganizationMembership,
  Post,
} from "@/lib/domain/types";
import { CONTENT_TYPES } from "@/lib/domain/types";
import { sortPosts } from "@/lib/domain/posts";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import type {
  Json,
  OrganizationRow,
  PostRow,
  PostScheduleRow,
  SocialPlatformEnum,
} from "@/lib/supabase/database.types";
import {
  RepositoryError,
  type DataRepository,
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
  return { id: row.id, name: row.name, isDemo: row.is_demo, createdAt: row.created_at };
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
      .select("organization_id, role")
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
      this.db.from("social_accounts").select("*").match(byBrand),
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
      .update({ title: patch.title, caption: patch.caption, status: patch.status })
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
}
