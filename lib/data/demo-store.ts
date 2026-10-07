import "server-only";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type {
  BrandBrain,
  ChatMessage,
  HqCampaign,
  ID,
  LocationProfileInput,
  Organization,
  OrganizationRole,
  Post,
  SnsAccount,
  ContentPillar,
  PlanProposal,
  Recommendation,
} from "@/lib/domain/types";
import { EMPTY_PUBLISHING } from "@/lib/domain/types";
import { emptyConnection } from "@/lib/social/connection";
import type {
  AccountCandidate,
  ContentLearning,
  MediaAsset,
  MetricSnapshot,
  PerformanceReview,
  PublishJob,
  PublishablePlatform,
  SocialEvent,
} from "@/lib/social/types";
import type {
  AdAccount,
  AdCampaign,
  AdCreativeRecord,
  AdMetricSnapshot,
  AdRecord,
  AdSetRecord,
  AiAdAnalysis,
  CreativeHypothesis,
  Experiment,
  FirstPartyConversion,
} from "@/lib/ads/types";

/**
 * In-memory data store used when Supabase is not configured.
 * Mirrors the Postgres tables closely enough to exercise the same flows.
 * In development it is persisted to .demo-data/store.json (gitignored)
 * so data survives dev-server restarts. It is NOT a production store.
 */
export interface DemoUserRecord {
  id: ID;
  email: string;
  displayName: string;
  passwordHash: string;
}

export interface DemoConversationRecord {
  id: ID;
  organizationId: ID;
  userId: ID;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface DemoStoreData {
  version: 1;
  users: DemoUserRecord[];
  organizations: Organization[];
  members: { organizationId: ID; userId: ID; role: OrganizationRole; locationIds?: ID[] | null }[];
  brands: BrandBrain[];
  posts: Post[];
  conversations: DemoConversationRecord[];
  accounts?: (SnsAccount & { organizationId: ID })[];
  locationProfiles?: (LocationProfileInput & { organizationId: ID; locationId: ID })[];
  hqCampaigns?: (HqCampaign & { organizationId: ID })[];
  contentPillars?: (ContentPillar & { organizationId: ID })[];
  planProposals?: (PlanProposal & { organizationId: ID })[];
  recommendations?: Recommendation[];
  social?: DemoSocialData;
  ads?: DemoAdsData;
}

/** Ad optimization loop collections (see lib/ads/demo-store.ts). */
export interface DemoAdsData {
  accounts: AdAccount[];
  credentials: { organizationId: ID; adAccountId: ID; ciphertext: string; expiresAt: string | null; scopes: string[] }[];
  campaigns: AdCampaign[];
  adSets: AdSetRecord[];
  ads: AdRecord[];
  creatives: AdCreativeRecord[];
  snapshots: AdMetricSnapshot[];
  conversions: FirstPartyConversion[];
  analyses: AiAdAnalysis[];
  hypotheses: CreativeHypothesis[];
  experiments: Experiment[];
}

export function emptyAds(): DemoAdsData {
  return { accounts: [], credentials: [], campaigns: [], adSets: [], ads: [], creatives: [], snapshots: [], conversions: [], analyses: [], hypotheses: [], experiments: [] };
}

/** Publishing-loop collections (see lib/social/demo-store.ts). */
export interface DemoSocialData {
  credentials: {
    organizationId: ID;
    socialAccountId: ID;
    provider: PublishablePlatform;
    externalAccountId: string;
    ciphertext: string;
    tokenExpiresAt: string | null;
    scopes: string[];
    lastRefreshedAt: string | null;
    refreshFailures: number;
    createdAt: string;
  }[];
  pending: {
    id: ID;
    organizationId: ID;
    userId: ID;
    provider: PublishablePlatform;
    candidates: AccountCandidate[];
    ciphertext: string;
    tokenExpiresAt: string | null;
    scopes: string[];
    expiresAt: string;
    consumedAt: string | null;
  }[];
  media: MediaAsset[];
  jobs: PublishJob[];
  snapshots: MetricSnapshot[];
  reviews: PerformanceReview[];
  learnings: ContentLearning[];
  events: SocialEvent[];
}

export function emptySocial(): DemoSocialData {
  return { credentials: [], pending: [], media: [], jobs: [], snapshots: [], reviews: [], learnings: [], events: [] };
}

const FILE = path.join(process.cwd(), ".demo-data", "store.json");
const persistEnabled = process.env.NODE_ENV !== "production" && process.env.NAORU_DEMO_PERSIST !== "0";

function emptyStore(): DemoStoreData {
  return { version: 1, users: [], organizations: [], members: [], brands: [], posts: [], conversations: [] };
}

function load(): DemoStoreData {
  if (!persistEnabled) return emptyStore();
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as DemoStoreData;
    return parsed.version === 1 ? parsed : emptyStore();
  } catch {
    return emptyStore();
  }
}

const globalForStore = globalThis as unknown as { __naoruDemoStore?: DemoStoreData };

export function getDemoStore(): Required<DemoStoreData> {
  const store = (globalForStore.__naoruDemoStore ??= load());
  // Collections added after v1 (older persisted files don't have them).
  store.accounts ??= [];
  store.locationProfiles ??= [];
  store.hqCampaigns ??= [];
  store.contentPillars ??= [];
  store.planProposals ??= [];
  store.recommendations ??= [];
  store.social ??= emptySocial();
  store.ads ??= emptyAds();
  // Records persisted before the publishing loop existed.
  for (const post of store.posts) post.publishing ??= { ...EMPTY_PUBLISHING };
  for (const account of store.accounts) account.connection ??= emptyConnection();
  for (const org of store.organizations) org.timezone ??= "Asia/Tokyo";
  return store as Required<DemoStoreData>;
}

export function persistDemoStore(): void {
  if (!persistEnabled) return;
  try {
    mkdirSync(path.dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(getDemoStore(), null, 2));
  } catch {
    // Read-only filesystem (e.g. serverless): keep the in-memory copy only.
  }
}

export function newId(): ID {
  return crypto.randomUUID();
}

/**
 * Deterministic UUID generator for the shared demo seed. Every server instance
 * (e.g. each serverless cold start) rebuilds the demo with the same ids, so
 * cookies and URLs created on one instance stay valid on another.
 */
export function deterministicIds(namespace: string): () => ID {
  let n = 0;
  return () => {
    const hex = createHash("sha1").update(`${namespace}:${n++}`).digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  };
}
