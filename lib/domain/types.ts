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

export const CONTENT_TYPES = ["feed", "carousel", "reel", "story", "text", "short_video"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export type PostSource = "manual" | "ai_post_creator" | "ai_planner" | "demo";

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
}

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

export interface Recommendation {
  id: ID;
  kind: "creative_fatigue" | "content_opportunity" | "budget_allocation";
  title: string;
  body: string;
  meta: string;
  metric: string;
  tone: "warning" | "positive";
}
