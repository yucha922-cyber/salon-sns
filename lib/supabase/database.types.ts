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

export type GoalEnum = "acquisition" | "recruitment" | "branding" | "engagement" | "retention" | "custom";
export type OrganizationRoleEnum = "owner" | "admin" | "editor" | "viewer";
export type SocialPlatformEnum = "instagram" | "threads" | "tiktok" | "facebook" | "x" | "youtube" | "line";
export type PostStatusEnum = "draft" | "scheduled" | "approved" | "queued" | "publishing" | "published" | "failed";

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
  timezone: string;
};

export type OrganizationMemberRow = Timestamps & {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRoleEnum;
  location_ids: string[] | null;
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
  connection_status: "manual" | "connected" | "expired" | "error" | "disconnected" | "reauthorization_required";
  external_account_id: string | null;
  username: string;
  profile_image_url: string | null;
  token_expires_at: string | null;
  scopes: string[];
  connected_at: string | null;
  connected_by: string | null;
  last_synced_at: string | null;
  connection_error: string | null;
  provider_metadata: Json;
  is_brand_default: boolean;
  display_name: string;
  goal: GoalEnum;
  custom_goal: string;
  active: boolean;
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
  target_audience: string;
  kpi_targets: Json;
  preferred_posting_days: number[];
  preferred_posting_times: string[];
  notes: string;
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
  status: "draft" | "active" | "completed" | "archived";
  goal: GoalEnum;
  target_platforms: string[];
  content_directions: string[];
  required_messages: string[];
  optional_messages: string[];
  cta: string;
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
  theme: string;
  hook: string;
  summary: string;
  goal: string | null;
  target: string;
  content_pillar: string;
  funnel_stage: string;
  plan_proposal_item_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  published_at: string | null;
  provider_post_id: string | null;
  permalink: string | null;
  publish_error: string | null;
};

export type ContentPillarRow = Timestamps & {
  id: string;
  organization_id: string | null;
  goal: GoalEnum;
  key: string;
  label: string;
  description: string;
  sort_order: number;
};

export type AiPlanProposalRow = Timestamps & {
  id: string;
  organization_id: string;
  social_account_id: string;
  location_id: string | null;
  hq_campaign_id: string | null;
  month: string;
  goal: string;
  summary: string;
  ai_provider: string | null;
  status: "pending" | "partially_approved" | "approved" | "rejected";
  created_by: string | null;
};

export type AiPlanProposalItemRow = Timestamps & {
  id: string;
  organization_id: string;
  proposal_id: string;
  scheduled_date: string;
  scheduled_time: string;
  platform: SocialPlatformEnum;
  content_type: string;
  theme: string;
  hook: string;
  summary: string;
  goal: string;
  target: string;
  content_pillar: string;
  funnel_stage: string;
  cta: string;
  status: "pending" | "approved" | "rejected";
  post_id: string | null;
  sort_order: number;
};

export type AiRecommendationRow = Timestamps & {
  id: string;
  organization_id: string;
  brand_id: string | null;
  category: "social" | "ads" | "creative" | "strategy" | "recruitment" | "acquisition";
  title: string;
  observation: string;
  hypothesis: string;
  recommended_action: string;
  expected_impact: string;
  status: "pending" | "approved" | "rejected" | "completed";
  approved_by: string | null;
  approved_at: string | null;
  payload: Json | null;
  location_id: string | null;
  social_account_id: string | null;
  severity: "low" | "medium" | "high";
  insight: string;
  confidence: number;
  decided_by: string | null;
  decided_at: string | null;
  source: "operations" | "performance" | "manual" | "ads";
  source_post_ids: string[];
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

export type PublishablePlatformEnum = "instagram" | "threads";

export type SocialAccountCredentialRow = Timestamps & {
  social_account_id: string;
  organization_id: string;
  provider: SocialPlatformEnum;
  external_account_id: string;
  access_token_ciphertext: string;
  token_expires_at: string | null;
  scopes: string[];
  last_refreshed_at: string | null;
  refresh_failures: number;
};

export type SocialOauthPendingRow = {
  id: string;
  organization_id: string;
  user_id: string;
  provider: SocialPlatformEnum;
  candidates: Json;
  access_token_ciphertext: string;
  token_expires_at: string | null;
  scopes: string[];
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

export type MediaAssetRow = Timestamps & {
  id: string;
  organization_id: string;
  location_id: string | null;
  post_id: string | null;
  storage_path: string;
  kind: "image" | "video";
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  status: "pending" | "ready" | "failed";
  sort_order: number;
  created_by: string | null;
};

export type PublishJobRow = Timestamps & {
  id: string;
  organization_id: string;
  location_id: string | null;
  social_account_id: string;
  post_id: string;
  provider: SocialPlatformEnum;
  publish_format: string;
  mode: "scheduled" | "immediate";
  scheduled_at: string;
  status: "queued" | "publishing" | "retrying" | "published" | "failed" | "cancelled";
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  locked_until: string | null;
  content_snapshot: Json;
  provider_container_id: string | null;
  provider_post_id: string | null;
  provider_permalink: string | null;
  provider_response: Json | null;
  last_error: string | null;
  last_error_code: string | null;
  published_at: string | null;
  requested_by: string | null;
};

export type MetricSnapshotRow = {
  id: string;
  organization_id: string;
  location_id: string | null;
  social_account_id: string;
  post_id: string | null;
  provider: SocialPlatformEnum;
  scope: "post" | "account";
  provider_post_id: string | null;
  captured_at: string;
  hours_since_publish: number | null;
  metrics: Json;
  raw: Json;
  created_at: string;
};

export type PostPerformanceReviewRow = {
  id: string;
  organization_id: string;
  location_id: string | null;
  social_account_id: string | null;
  post_id: string;
  snapshot_id: string | null;
  summary: string;
  what_worked: string[];
  what_did_not_work: string[];
  possible_reasons: string[];
  key_learning: string;
  recommended_next_action: string;
  next_creative_hypothesis: string;
  confidence: number;
  ai_provider: string | null;
  created_by: string | null;
  created_at: string;
};

export type ContentLearningRow = Timestamps & {
  id: string;
  organization_id: string;
  brand_id: string | null;
  location_id: string | null;
  social_account_id: string | null;
  platform: SocialPlatformEnum | null;
  goal: GoalEnum | null;
  content_pillar: string;
  hypothesis: string;
  result: string;
  learning: string;
  confidence: number;
  valid_from: string;
  valid_until: string | null;
  source_post_ids: string[];
  source_review_id: string | null;
  status: "active" | "archived";
  created_by: string | null;
  kind: "content" | "creative";
  attributes: Json;
  source_experiment_id: string | null;
};

export type SocialEventLogRow = {
  id: string;
  organization_id: string;
  location_id: string | null;
  social_account_id: string | null;
  post_id: string | null;
  publish_job_id: string | null;
  event_type: string;
  level: "info" | "warn" | "error";
  message: string;
  details: Json;
  actor_user_id: string | null;
  created_at: string;
};

export type AdAccountRow = Timestamps & {
  id: string;
  organization_id: string;
  brand_id: string | null;
  location_id: string | null;
  provider: "meta";
  business_id: string | null;
  external_account_id: string;
  name: string;
  currency: string;
  timezone: string;
  account_status: string | null;
  connection_status: "connected" | "expired" | "error" | "disconnected" | "reauthorization_required";
  scopes: string[];
  token_expires_at: string | null;
  last_synced_at: string | null;
  connection_error: string | null;
  metadata: Json;
  connected_by: string | null;
  connected_at: string | null;
};

export type AdAccountCredentialRow = Timestamps & {
  ad_account_id: string;
  organization_id: string;
  access_token_ciphertext: string;
  token_kind: "user" | "system_user";
  token_expires_at: string | null;
  scopes: string[];
  last_refreshed_at: string | null;
};

export type CampaignRow = Timestamps & {
  id: string;
  organization_id: string;
  brand_id: string | null;
  location_id: string | null;
  provider: string;
  external_id: string | null;
  name: string;
  objective: string | null;
  status: string;
  daily_budget: number | null;
  currency: string;
  ad_account_id: string | null;
  goal: GoalEnum;
  effective_status: string | null;
  lifetime_budget: number | null;
  special_ad_categories: string[];
  landing_page_url: string | null;
  start_time: string | null;
  stop_time: string | null;
  conversion_event: string | null;
  last_synced_at: string | null;
  raw: Json;
};

export type AdSetRow = Timestamps & {
  id: string;
  organization_id: string;
  campaign_id: string;
  external_id: string | null;
  name: string;
  status: string;
  targeting: Json | null;
  location_id: string | null;
  effective_status: string | null;
  optimization_goal: string | null;
  billing_event: string | null;
  daily_budget: number | null;
  promoted_object: Json | null;
  audience_label: string;
  last_synced_at: string | null;
  raw: Json;
};

export type AdRow = Timestamps & {
  id: string;
  organization_id: string;
  ad_set_id: string;
  creative_id: string | null;
  external_id: string | null;
  name: string;
  status: string;
  campaign_id: string | null;
  location_id: string | null;
  effective_status: string | null;
  landing_page_url: string | null;
  provider_created_at: string | null;
  review_feedback: Json | null;
  last_synced_at: string | null;
  raw: Json;
};

export type CreativeRow = Timestamps & {
  id: string;
  organization_id: string;
  brand_id: string | null;
  concept: string;
  headline: string;
  body: string;
  cta: string;
  format: string | null;
  asset_id: string | null;
  status: string;
  ad_account_id: string | null;
  location_id: string | null;
  external_id: string | null;
  source: "synced" | "ai_generated" | "manual";
  goal: string | null;
  hook: string;
  angle: string;
  persona: string;
  pain_point: string;
  offer: string;
  first_view_copy: string;
  visual_direction: string;
  video_script: Json | null;
  brief: Json | null;
  thumbnail_url: string | null;
  landing_page_url: string | null;
  hypothesis_id: string | null;
  parent_creative_id: string | null;
  variable_changed: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  ai_provider: string | null;
};

export type AdMetricSnapshotRow = {
  id: string;
  organization_id: string;
  ad_account_id: string | null;
  location_id: string | null;
  entity_type: "account" | "campaign" | "ad_set" | "ad";
  entity_id: string;
  date: string;
  date_stop: string;
  spend: number;
  impressions: number;
  reach: number | null;
  frequency: number | null;
  clicks: number;
  landing_page_views: number | null;
  conversions: number;
  revenue: number | null;
  video_3s_views: number | null;
  thruplays: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cvr: number | null;
  cpa: number | null;
  roas: number | null;
  raw_metrics: Json;
  source: "provider" | "mock";
  captured_at: string;
  created_at: string;
};

export type AdConversionRow = {
  id: string;
  organization_id: string;
  location_id: string | null;
  campaign_id: string | null;
  ad_id: string | null;
  kind: "lead" | "reservation" | "visit" | "contract" | "application" | "revenue";
  occurred_on: string;
  count: number;
  revenue: number | null;
  source: "manual" | "csv" | "api";
  note: string;
  created_by: string | null;
  created_at: string;
};

export type AiAdAnalysisRow = {
  id: string;
  organization_id: string;
  location_id: string | null;
  campaign_id: string | null;
  period_start: string;
  period_end: string;
  summary: string;
  findings: Json;
  ai_provider: string | null;
  created_by: string | null;
  created_at: string;
};

export type CreativeHypothesisRow = Timestamps & {
  id: string;
  organization_id: string;
  location_id: string | null;
  analysis_id: string | null;
  campaign_id: string | null;
  ad_set_id: string | null;
  ad_id: string | null;
  goal: string;
  problem: string;
  hypothesis: string;
  change_variable: string;
  test_idea: string;
  expected_result: string;
  primary_metric: string;
  confidence: number;
  status: string;
  decided_by: string | null;
  decided_at: string | null;
};

export type ExperimentRow = Timestamps & {
  id: string;
  organization_id: string;
  location_id: string | null;
  campaign_id: string | null;
  ad_set_id: string | null;
  hypothesis_id: string | null;
  name: string;
  goal: string;
  variable: string;
  hypothesis: string;
  primary_metric: string;
  secondary_metrics: string[];
  criteria: Json;
  control_variant_id: string | null;
  status: "draft" | "approved" | "running" | "completed" | "cancelled";
  decision: "winner" | "inconclusive" | "insufficient_data" | null;
  winner_variant_id: string | null;
  result_summary: Json | null;
  start_date: string | null;
  end_date: string | null;
  approved_by: string | null;
  approved_at: string | null;
  launched_by: string | null;
  launched_at: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_by: string | null;
};

export type ExperimentVariantRow = Timestamps & {
  id: string;
  organization_id: string;
  experiment_id: string;
  role: "control" | "challenger";
  label: string;
  creative_id: string | null;
  ad_id: string | null;
  provider_ad_id: string | null;
  variable_changed: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number | null;
  frequency: number | null;
  ctr: number | null;
  cvr: number | null;
  cpa: number | null;
  roas: number | null;
  decision: "winner" | "loser" | "inconclusive" | "insufficient_data" | null;
  metrics_updated_at: string | null;
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
      content_pillars: Table<ContentPillarRow, "goal" | "key" | "label">;
      ai_plan_proposals: Table<AiPlanProposalRow, "organization_id" | "social_account_id" | "month" | "goal">;
      ai_plan_proposal_items: Table<
        AiPlanProposalItemRow,
        "organization_id" | "proposal_id" | "scheduled_date" | "scheduled_time" | "platform" | "content_type" | "theme" | "goal"
      >;
      ai_recommendations: Table<AiRecommendationRow, "organization_id" | "category" | "title">;
      social_account_credentials: Table<
        SocialAccountCredentialRow,
        "social_account_id" | "organization_id" | "provider" | "external_account_id" | "access_token_ciphertext"
      >;
      social_oauth_pending: Table<SocialOauthPendingRow, "organization_id" | "user_id" | "provider" | "access_token_ciphertext">;
      media_assets: Table<MediaAssetRow, "organization_id" | "storage_path" | "kind" | "mime_type" | "size_bytes">;
      publish_jobs: Table<
        PublishJobRow,
        "organization_id" | "social_account_id" | "post_id" | "provider" | "publish_format" | "scheduled_at" | "next_attempt_at" | "content_snapshot"
      >;
      metric_snapshots: Table<MetricSnapshotRow, "organization_id" | "social_account_id" | "provider" | "scope" | "metrics">;
      post_performance_reviews: Table<PostPerformanceReviewRow, "organization_id" | "post_id" | "summary" | "confidence">;
      content_learnings: Table<ContentLearningRow, "organization_id" | "learning" | "confidence">;
      social_event_logs: Table<SocialEventLogRow, "organization_id" | "event_type">;
      ad_accounts: Table<AdAccountRow, "organization_id" | "external_account_id">;
      ad_account_credentials: Table<AdAccountCredentialRow, "ad_account_id" | "organization_id" | "access_token_ciphertext">;
      campaigns: Table<CampaignRow, "organization_id" | "name">;
      ad_sets: Table<AdSetRow, "organization_id" | "campaign_id" | "name">;
      ads: Table<AdRow, "organization_id" | "ad_set_id" | "name">;
      creatives: Table<CreativeRow, "organization_id">;
      ad_metric_snapshots: Table<AdMetricSnapshotRow, "organization_id" | "entity_type" | "entity_id" | "date" | "date_stop">;
      ad_conversions: Table<AdConversionRow, "organization_id" | "kind" | "occurred_on">;
      ai_ad_analyses: Table<AiAdAnalysisRow, "organization_id" | "period_start" | "period_end">;
      creative_hypotheses: Table<CreativeHypothesisRow, "organization_id" | "problem" | "hypothesis" | "change_variable" | "confidence">;
      experiments: Table<ExperimentRow, "organization_id" | "name" | "variable">;
      experiment_variants: Table<ExperimentVariantRow, "organization_id" | "experiment_id" | "role" | "label">;
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
