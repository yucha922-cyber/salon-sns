import type {
  BrandBrain,
  BrandBrainInput,
  ChatMessage,
  ChatRole,
  Conversation,
  ID,
  NewPostInput,
  Organization,
  OrganizationMembership,
  HqCampaign,
  HqCampaignInput,
  LocationProfile,
  LocationProfileInput,
  Post,
  PostStatus,
  SnsAccount,
  SnsAccountInput,
} from "@/lib/domain/types";
import type { DataMode } from "@/lib/env";

export interface SaveBrandBrainOptions {
  /** Highest onboarding step reached (progress is never moved backwards). */
  onboardingStep?: number;
  completeOnboarding?: boolean;
}

export interface PostPatch {
  title?: string;
  caption?: string;
  status?: PostStatus;
  scheduledAt?: string | null;
}

/**
 * Data access boundary. UI / server actions only talk to this interface;
 * implementations decide where data lives:
 *   - SupabaseRepository: Postgres via the user's session (RLS enforced)
 *   - DemoRepository: in-memory store with explicit membership checks
 *
 * Every method that takes an organizationId MUST verify the current user is
 * a member of that organization (Supabase does it through RLS).
 */
export interface DataRepository {
  readonly mode: DataMode;
  readonly userId: ID;

  listMemberships(): Promise<OrganizationMembership[]>;
  createOrganization(name: string, options?: { isDemo?: boolean }): Promise<Organization>;
  renameOrganization(organizationId: ID, name: string): Promise<void>;

  getBrandBrain(organizationId: ID): Promise<BrandBrain | null>;
  saveBrandBrain(organizationId: ID, input: BrandBrainInput, options?: SaveBrandBrainOptions): Promise<BrandBrain>;

  /** Posts ordered by scheduled time (unscheduled last). */
  listPosts(organizationId: ID): Promise<Post[]>;
  createPost(organizationId: ID, input: NewPostInput): Promise<Post>;
  updatePost(organizationId: ID, postId: ID, patch: PostPatch): Promise<Post>;

  listConversations(organizationId: ID): Promise<Omit<Conversation, "messages">[]>;
  getConversation(organizationId: ID, conversationId: ID): Promise<Conversation | null>;
  createConversation(organizationId: ID, title: string): Promise<Omit<Conversation, "messages">>;
  appendMessage(
    organizationId: ID,
    conversationId: ID,
    message: { role: ChatRole; content: string; aiProvider?: string },
  ): Promise<ChatMessage>;

  // Account strategy (SNS accounts with goal + strategy)
  listAccounts(organizationId: ID): Promise<SnsAccount[]>;
  /** id = null creates a new account. */
  saveAccount(organizationId: ID, accountId: ID | null, input: SnsAccountInput): Promise<SnsAccount>;
  deleteAccount(organizationId: ID, accountId: ID): Promise<void>;

  // Location customization — one profile per Brand Brain location
  listLocationProfiles(organizationId: ID): Promise<LocationProfile[]>;
  saveLocationProfile(organizationId: ID, locationId: ID, input: LocationProfileInput): Promise<LocationProfile>;

  // Headquarters templates
  listHqCampaigns(organizationId: ID): Promise<HqCampaign[]>;
  saveHqCampaign(organizationId: ID, campaignId: ID | null, input: HqCampaignInput): Promise<HqCampaign>;
  deleteHqCampaign(organizationId: ID, campaignId: ID): Promise<void>;
}

export const EMPTY_STRATEGY = {
  persona: "",
  kpis: [],
  contentPillars: [],
  postsPerWeek: 3,
  postingFrequencyNote: "",
  cta: "",
  tone: "",
} as const;

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "forbidden" | "invalid" | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}
