/**
 * Database types for the tables the app currently reads/writes.
 * Mirrors supabase/migrations/*.sql. When the Supabase CLI is available,
 * regenerate with:
 *   supabase gen types typescript --local > lib/supabase/database.types.ts
 * (Tables defined in SQL but not used by the app yet are omitted here.)
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = { created_at: string; updated_at: string };

/** Insert: required keys stay required, everything with a DB default becomes optional. */
type Table<R extends Record<string, unknown>, Req extends keyof R> = {
  Row: R;
  Insert: Pick<R, Req> & Partial<Omit<R, Req>>;
  Update: Partial<R>;
  Relationships: [];
};

export type OrganizationRoleEnum = "owner" | "admin" | "editor" | "viewer";
export type SocialPlatformEnum = "instagram" | "threads" | "tiktok" | "facebook" | "x" | "youtube" | "line";
export type PostStatusEnum = "draft" | "scheduled" | "published" | "failed";

export type ProfileRow = Timestamps & {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

export type OrganizationRow = Timestamps & {
  id: string;
  name: string;
  slug: string | null;
  is_demo: boolean;
  created_by: string | null;
};

export type OrganizationMemberRow = Timestamps & {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRoleEnum;
};

export type BrandRow = Timestamps & {
  id: string;
  organization_id: string;
  name: string;
  industry_key: string;
  industry_label: string;
  business_description: string;
  website: string;
  service_description: string;
  brand_personality: string[];
  brand_tone: string[];
  writing_tone: string;
  ai_context: string;
  onboarding_step: number;
  onboarding_completed_at: string | null;
};

export type BusinessProfileRow = Timestamps & {
  id: string;
  organization_id: string;
  brand_id: string;
  company_name: string;
  strengths: string[];
  features: string[];
  differentiators: string[];
  marketing_goals: string;
  social_goals: string;
  advertising_goals: string;
};

export type LocationRow = Timestamps & {
  id: string;
  organization_id: string;
  brand_id: string | null;
  name: string;
  address: string;
  timezone: string;
  is_primary: boolean;
  sort_order: number;
};

export type TargetAudienceRow = Timestamps & {
  id: string;
  organization_id: string;
  brand_id: string;
  summary: string;
  age_range: string;
  gender: string;
  occupation: string;
  pain_points: string[];
  use_cases: string[];
  is_primary: boolean;
};

export type PersonaRow = Timestamps & {
  id: string;
  organization_id: string;
  brand_id: string;
  target_audience_id: string | null;
  name: string;
  description: string;
  sort_order: number;
};

export type ServiceRow = Timestamps & {
  id: string;
  organization_id: string;
  brand_id: string;
  name: string;
  description: string;
  price: number | null;
  currency: string;
  sort_order: number;
};

export type CompetitorRow = Timestamps & {
  id: string;
  organization_id: string;
  brand_id: string;
  name: string;
  note: string;
  sort_order: number;
};

export type SocialAccountRow = Timestamps & {
  id: string;
  organization_id: string;
  brand_id: string;
  location_id: string | null;
  platform: SocialPlatformEnum;
  handle: string;
  connection_status: "manual" | "connected" | "expired" | "error";
  external_account_id: string | null;
  is_brand_default: boolean;
  display_name: string;
  goal: "acquisition" | "recruitment" | "branding";
};

export type AccountStrategyRow = Timestamps & {
  id: string;
  organization_id: string;
  social_account_id: string;
  persona: string;
  kpis: string[];
  content_pillars: string[];
  posts_per_week: number;
  posting_frequency_note: string;
  cta: string;
  tone: string;
};

export type LocationProfileRow = Timestamps & {
  id: string;
  organization_id: string;
  location_id: string;
  area: string;
  demographics: string;
  featured_services: string[];
  offers: string[];
  local_keywords: string[];
};

export type LocationStaffRow = Timestamps & {
  id: string;
  organization_id: string;
  location_id: string;
  name: string;
  role: string;
  specialty: string;
  sort_order: number;
};

export type HqCampaignRow = Timestamps & {
  id: string;
  organization_id: string;
  brand_id: string | null;
  name: string;
  status: "draft" | "active" | "ended";
  starts_on: string | null;
  ends_on: string | null;
  shared_theme: string;
  creative_headline: string;
  creative_body: string;
  creative_visual: string;
  localization_rules: string[];
  target_location_ids: string[];
  created_by: string | null;
};

export type PostRow = Timestamps & {
  id: string;
  organization_id: string;
  brand_id: string | null;
  location_id: string | null;
  platform: SocialPlatformEnum;
  content_type: string;
  title: string;
  caption: string;
  cta: string;
  hashtags: string[];
  status: PostStatusEnum;
  source: "manual" | "ai_post_creator" | "ai_planner" | "hq_localization" | "demo";
  generation_input: Json | null;
  ai_provider: string | null;
  created_by: string | null;
  social_account_id: string | null;
  hq_campaign_id: string | null;
};

export type PostScheduleRow = Timestamps & {
  id: string;
  organization_id: string;
  post_id: string;
  social_account_id: string | null;
  scheduled_at: string;
  timezone: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  published_at: string | null;
  error_message: string | null;
};

export type AiConversationRow = Timestamps & {
  id: string;
  organization_id: string;
  brand_id: string | null;
  user_id: string | null;
  title: string;
};

export type AiMessageRow = Timestamps & {
  id: string;
  organization_id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  ai_provider: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, "id">;
      organizations: Table<OrganizationRow, "name">;
      organization_members: Table<OrganizationMemberRow, "organization_id" | "user_id">;
      brands: Table<BrandRow, "organization_id">;
      business_profiles: Table<BusinessProfileRow, "organization_id" | "brand_id">;
      locations: Table<LocationRow, "organization_id" | "name">;
      target_audiences: Table<TargetAudienceRow, "organization_id" | "brand_id">;
      personas: Table<PersonaRow, "organization_id" | "brand_id" | "name">;
      services: Table<ServiceRow, "organization_id" | "brand_id" | "name">;
      competitors: Table<CompetitorRow, "organization_id" | "brand_id" | "name">;
      social_accounts: Table<SocialAccountRow, "organization_id" | "brand_id" | "platform">;
      posts: Table<PostRow, "organization_id" | "platform">;
      post_schedules: Table<PostScheduleRow, "organization_id" | "post_id" | "scheduled_at">;
      ai_conversations: Table<AiConversationRow, "organization_id">;
      ai_messages: Table<AiMessageRow, "organization_id" | "conversation_id" | "role" | "content">;
      account_strategies: Table<AccountStrategyRow, "organization_id" | "social_account_id">;
      location_profiles: Table<LocationProfileRow, "organization_id" | "location_id">;
      location_staff: Table<LocationStaffRow, "organization_id" | "location_id" | "name">;
      hq_campaigns: Table<HqCampaignRow, "organization_id" | "name">;
    };
    Views: { [_ in never]: never };
    Functions: {
      create_organization: { Args: { p_name: string; p_is_demo?: boolean }; Returns: string };
      save_brand_brain: { Args: { p_brand_id: string; p: Json }; Returns: undefined };
      is_org_member: { Args: { p_org: string }; Returns: boolean };
    };
    Enums: {
      organization_role: OrganizationRoleEnum;
      social_platform: SocialPlatformEnum;
      post_status: PostStatusEnum;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
