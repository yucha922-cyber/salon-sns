import "server-only";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
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
  members: { organizationId: ID; userId: ID; role: OrganizationRole }[];
  brands: BrandBrain[];
  posts: Post[];
  conversations: DemoConversationRecord[];
  accounts?: (SnsAccount & { organizationId: ID })[];
  locationProfiles?: (LocationProfileInput & { organizationId: ID; locationId: ID })[];
  hqCampaigns?: (HqCampaign & { organizationId: ID })[];
  contentPillars?: (ContentPillar & { organizationId: ID })[];
  planProposals?: (PlanProposal & { organizationId: ID })[];
  recommendations?: Recommendation[];
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
