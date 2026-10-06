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
  Post,
  PostStatus,
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
}

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "forbidden" | "invalid" | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}
