/**
 * Domain types — the shape the app (UI, AI, services) works with.
 * Database row types live in lib/supabase/database.types.ts and are mapped
 * into these by the repositories, so the UI never depends on table layout.
 */

export type ID = string;

export type OrganizationRole = "owner" | "admin" | "editor" | "viewer";

export interface AppUser {
  id: ID;
  email: string;
  displayName: string;
}

export interface Organization {
  id: ID;
  name: string;
  isDemo: boolean;
  createdAt: string;
}

export interface OrganizationMembership {
  organization: Organization;
  role: OrganizationRole;
}

// ---------------------------------------------------------------------------
// Brand Brain
// ---------------------------------------------------------------------------

export interface Industry {
  /** Slug such as "seitai", "restaurant" or "custom". Free-form by design. */
  key: string;
  /** Human-readable label shown in UI and passed to AI. */
  label: string;
}

export interface BrandLocation {
  id?: ID;
  name: string;
  address: string;
}

export interface BrandService {
  name: string;
  description: string;
  /** Price in JPY. null = not set / varies. */
  price: number | null;
}

export interface Competitor {
  name: string;
  note: string;
}

export interface Persona {
  name: string;
  description: string;
}

export interface TargetAudience {
  summary: string;
  ageRange: string;
  gender: string;
  occupation: string;
  painPoints: string[];
  useCases: string[];
}

export interface SocialHandles {
  instagram: string;
  threads: string;
  tiktok: string;
  facebook: string;
}

/** Editable content of a Brand Brain (what forms submit and AI reads). */
export interface BrandBrainInput {
  companyName: string;
  brandName: string;
  industry: Industry;
  businessDescription: string;
  website: string;
  social: SocialHandles;
  locations: BrandLocation[];
  services: BrandService[];
  serviceDescription: string;
  strengths: string[];
  features: string[];
  competitors: Competitor[];
  differentiators: string[];
  targetAudience: TargetAudience;
  personas: Persona[];
  brandPersonality: string[];
  brandTone: string[];
  writingTone: string;
  marketingGoals: string;
  socialGoals: string;
  advertisingGoals: string;
  /** Free-form notes the AI should always keep in mind. */
  aiContext: string;
}

export interface BrandBrain extends BrandBrainInput {
  brandId: ID;
  organizationId: ID;
  onboardingStep: number;
  onboardingCompletedAt: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// SNS posts
// ---------------------------------------------------------------------------

export const SOCIAL_PLATFORMS = ["instagram", "threads", "tiktok", "facebook"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const POST_STATUSES = ["draft", "scheduled", "published", "failed"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const CONTENT_TYPES = [
  "feed",
  "carousel",
  "reel",
  "story",
  "text",
  "short_video",
  "threads_text",
  "before_after",
  "staff",
  "educational",
  "testimonial",
  "offer",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export type PostSource = "manual" | "ai_post_creator" | "ai_planner" | "hq_localization" | "demo";

export interface Post {
  id: ID;
  organizationId: ID;
  platform: SocialPlatform;
  contentType: ContentType;
  title: string;
  caption: string;
  cta: string;
  hashtags: string[];
  status: PostStatus;
  source: PostSource;
  /** ISO timestamp; null when not scheduled yet. */
  scheduledAt: string | null;
  createdAt: string;
  accountId: ID | null;
  locationId: ID | null;
  hqCampaignId: ID | null;
  /** Planning fields (filled by the AI monthly plan; empty for ad-hoc posts). */
  planning: PostPlanning;
}

export interface PostPlanning {
  theme: string;
  hook: string;
  summary: string;
  goal: AccountGoal | null;
  target: string;
  contentPillar: string;
  funnelStage: string;
  planItemId: ID | null;
}

export const EMPTY_PLANNING: PostPlanning = {
  theme: "",
  hook: "",
  summary: "",
  goal: null,
  target: "",
  contentPillar: "",
  funnelStage: "",
  planItemId: null,
};

export interface NewPostInput {
  platform: SocialPlatform;
  contentType: ContentType;
  title: string;
  caption: string;
  cta: string;
  hashtags: string[];
  status: PostStatus;
  scheduledAt: string | null;
  source: PostSource;
  generationInput?: Record<string, string>;
  aiProvider?: string;
  accountId?: ID | null;
  locationId?: ID | null;
  hqCampaignId?: ID | null;
  planning?: Partial<PostPlanning>;
}

// ---------------------------------------------------------------------------
// AI conversations
// ---------------------------------------------------------------------------

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: ID;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: ID;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

// ---------------------------------------------------------------------------
// Advertising / analytics (read-only in MVP)
// ---------------------------------------------------------------------------

export type CampaignStatus = "active" | "paused" | "needs_review";

export interface Campaign {
  id: ID;
  name: string;
  status: CampaignStatus;
  spend: number;
  impressions: number;
  ctr: number;
  clicks: number;
  conversions: number;
  roas: number;
}

export interface MetricSummary {
  label: string;
  value: string;
  change: string | null;
  glyph: string;
  positive: boolean;
}

export const RECOMMENDATION_CATEGORIES = ["social", "ads", "creative", "strategy", "recruitment", "acquisition"] as const;
export type RecommendationCategory = (typeof RECOMMENDATION_CATEGORIES)[number];
export const RECOMMENDATION_STATUSES = ["pending", "approved", "rejected", "completed"] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];
export type Severity = "low" | "medium" | "high";

export interface RecommendationInput {
  locationId: ID | null;
  socialAccountId: ID | null;
  category: RecommendationCategory;
  severity: Severity;
  title: string;
  observation: string;
  insight: string;
  hypothesis: string;
  recommendedAction: string;
  expectedImpact: string;
  /** 0..1 */
  confidence: number;
}

/** AI proposes, a human approves / rejects / marks completed. */
export interface Recommendation extends RecommendationInput {
  id: ID;
  organizationId: ID;
  status: RecommendationStatus;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Account strategy / HQ templates / location customization
// ---------------------------------------------------------------------------

export const ACCOUNT_GOALS = ["acquisition", "recruitment", "branding", "engagement", "retention", "custom"] as const;
export type AccountGoal = (typeof ACCOUNT_GOALS)[number];

export interface KpiTarget {
  metric: string;
  /** null = tracked without a numeric target */
  target: number | null;
  unit: string;
}

export interface AccountStrategy {
  targetAudience: string;
  persona: string;
  kpiTargets: KpiTarget[];
  /** Content pillar keys (library) or free labels (legacy / custom). */
  contentPillars: string[];
  postsPerWeek: number;
  postingFrequencyNote: string;
  /** 0 = Sunday … 6 = Saturday */
  preferredPostingDays: number[];
  /** "HH:MM", Japan time */
  preferredPostingTimes: string[];
  /** CTA strategy */
  cta: string;
  tone: string;
  notes: string;
}

export interface SnsAccountInput {
  platform: SocialPlatform;
  handle: string;
  /** accountName */
  displayName: string;
  /** null = HQ / brand-wide account */
  locationId: ID | null;
  goal: AccountGoal;
  /** Label when goal = "custom" */
  customGoal: string;
  active: boolean;
  strategy: AccountStrategy;
}

export interface SnsAccount extends SnsAccountInput {
  id: ID;
  /** Created from the Brand Brain "SNS" section. */
  isBrandDefault: boolean;
  connectionStatus: "manual" | "connected" | "expired" | "error";
}

export interface ContentPillar {
  id: ID;
  key: string;
  label: string;
  goal: AccountGoal;
  description: string;
  /** System preset (shared, read-only) vs organization custom pillar */
  isSystem: boolean;
}

// ---------------------------------------------------------------------------
// AI monthly plan proposals (human-in-the-loop)
// ---------------------------------------------------------------------------

export const PLAN_ITEM_STATUSES = ["pending", "approved", "rejected"] as const;
export type PlanItemStatus = (typeof PLAN_ITEM_STATUSES)[number];
export type PlanProposalStatus = "pending" | "partially_approved" | "approved" | "rejected";

export interface PlanItemInput {
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:MM
  platform: SocialPlatform;
  contentType: ContentType;
  theme: string;
  hook: string;
  summary: string;
  goal: AccountGoal;
  target: string;
  contentPillar: string;
  funnelStage: string;
  cta: string;
}

export interface PlanItem extends PlanItemInput {
  id: ID;
  status: PlanItemStatus;
  postId: ID | null;
}

export interface PlanProposalInput {
  accountId: ID;
  locationId: ID | null;
  hqCampaignId: ID | null;
  month: string; // YYYY-MM
  goal: AccountGoal;
  summary: string;
  aiProvider: string;
  items: PlanItemInput[];
}

export interface PlanProposal extends Omit<PlanProposalInput, "items"> {
  id: ID;
  status: PlanProposalStatus;
  createdAt: string;
  items: PlanItem[];
}

export interface StaffMember {
  name: string;
  role: string;
  specialty: string;
}

export interface LocationProfileInput {
  area: string;
  demographics: string;
  featuredServices: string[];
  staff: StaffMember[];
  offers: string[];
  localKeywords: string[];
}

export interface LocationProfile extends LocationProfileInput {
  locationId: ID;
  locationName: string;
  address: string;
}

export const HQ_CAMPAIGN_STATUSES = ["draft", "active", "completed", "archived"] as const;
export type HqCampaignStatus = (typeof HQ_CAMPAIGN_STATUSES)[number];

/** Organization campaign / content theme distributed by HQ to locations. */
export interface HqCampaignInput {
  /** title */
  name: string;
  status: HqCampaignStatus;
  goal: AccountGoal;
  startsOn: string | null;
  endsOn: string | null;
  /** description / shared content theme */
  sharedTheme: string;
  contentDirections: string[];
  requiredMessages: string[];
  optionalMessages: string[];
  cta: string;
  creative: { headline: string; body: string; visual: string };
  localizationRules: string[];
  /** empty = all locations */
  targetLocationIds: ID[];
  /** empty = all platforms */
  targetPlatforms: SocialPlatform[];
}

export interface HqCampaign extends HqCampaignInput {
  id: ID;
  createdAt: string;
}
