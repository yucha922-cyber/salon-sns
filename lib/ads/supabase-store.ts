import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import type { ID } from "@/lib/domain/types";
import type { AnySupabaseClient } from "@/lib/supabase/admin";
import type {
  AdAccountRow,
  AdConversionRow,
  AdMetricSnapshotRow,
  AdRow,
  AdSetRow,
  AiAdAnalysisRow,
  CampaignRow,
  CreativeHypothesisRow,
  CreativeRow,
  Database,
  ExperimentRow,
  ExperimentVariantRow,
  Json,
} from "@/lib/supabase/database.types";
import { decryptSecret, encryptSecret } from "@/lib/social/crypto";
import { sanitize } from "@/lib/social/errors";
import { derive } from "./metrics";
import {
  AdsStoreError,
  type AdsStore,
  type CreativePatch,
  type ExperimentPatch,
  type NewAdAccount,
  type NewCreative,
  type NewExperiment,
  type NewHypothesis,
  type NewSnapshot,
  type SyncedAd,
  type SyncedAdSet,
  type SyncedCampaign,
  type VariantPatch,
} from "./store";
import type {
  AdAccount,
  AdCampaign,
  AdCreativeRecord,
  AdFinding,
  AdGoal,
  AdMetricSnapshot,
  AdRecord,
  AdSetRecord,
  AiAdAnalysis,
  CreativeAngle,
  CreativeBrief,
  CreativeHypothesis,
  CreativeStatus,
  Experiment,
  ExperimentCriteria,
  ExperimentResult,
  ExperimentVariant,
  FirstPartyConversion,
  PrimaryMetric,
  TestVariable,
  VideoScript,
} from "./types";

type Tables = Database["public"]["Tables"];

function fail(error: PostgrestError | null, context: string): void {
  if (!error) return;
  const code = error.code === "42501" ? "forbidden" : error.code === "23505" ? "conflict" : error.code === "PGRST116" ? "not_found" : "unknown";
  throw new AdsStoreError(`${context}: ${error.message}`, code);
}

const asObject = (v: Json | null | undefined): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const toJson = (v: unknown): Json => JSON.parse(JSON.stringify(v ?? null)) as Json;
const num = (v: number | string | null): number | null => (v === null ? null : Number(v));
const adGoal = (g: string | null): AdGoal => (g === "recruitment" ? "recruitment" : "acquisition");
const nowIso = () => new Date().toISOString();

function toAccount(r: AdAccountRow): AdAccount {
  const meta = Object.fromEntries(
    Object.entries(asObject(r.metadata)).filter((e): e is [string, string | number | boolean | null] => e[1] === null || ["string", "number", "boolean"].includes(typeof e[1])),
  );
  return {
    id: r.id,
    organizationId: r.organization_id,
    brandId: r.brand_id,
    locationId: r.location_id,
    provider: "meta",
    businessId: r.business_id,
    externalAccountId: r.external_account_id,
    name: r.name,
    currency: r.currency,
    timezone: r.timezone,
    accountStatus: r.account_status,
    connectionStatus: r.connection_status,
    scopes: r.scopes,
    tokenExpiresAt: r.token_expires_at,
    lastSyncedAt: r.last_synced_at,
    connectionError: r.connection_error,
    metadata: meta,
  };
}

function toCampaign(r: CampaignRow): AdCampaign {
  return {
    id: r.id,
    organizationId: r.organization_id,
    adAccountId: r.ad_account_id,
    locationId: r.location_id,
    externalId: r.external_id,
    name: r.name,
    objective: r.objective,
    goal: adGoal(r.goal),
    status: r.status,
    effectiveStatus: r.effective_status,
    dailyBudget: num(r.daily_budget),
    lifetimeBudget: num(r.lifetime_budget),
    currency: r.currency,
    specialAdCategories: r.special_ad_categories ?? [],
    landingPageUrl: r.landing_page_url,
    conversionEvent: r.conversion_event,
    startTime: r.start_time,
    stopTime: r.stop_time,
    lastSyncedAt: r.last_synced_at,
  };
}

function toAdSet(r: AdSetRow): AdSetRecord {
  return {
    id: r.id,
    organizationId: r.organization_id,
    campaignId: r.campaign_id,
    locationId: r.location_id,
    externalId: r.external_id,
    name: r.name,
    status: r.status,
    effectiveStatus: r.effective_status,
    optimizationGoal: r.optimization_goal,
    billingEvent: r.billing_event,
    dailyBudget: num(r.daily_budget),
    audienceLabel: r.audience_label,
    targeting: r.targeting ? asObject(r.targeting) : null,
  };
}

function toAd(r: AdRow): AdRecord {
  return {
    id: r.id,
    organizationId: r.organization_id,
    campaignId: r.campaign_id,
    adSetId: r.ad_set_id,
    creativeId: r.creative_id,
    locationId: r.location_id,
    externalId: r.external_id,
    name: r.name,
    status: r.status,
    effectiveStatus: r.effective_status,
    landingPageUrl: r.landing_page_url,
    providerCreatedAt: r.provider_created_at,
  };
}

function toCreative(r: CreativeRow): AdCreativeRecord {
  return {
    id: r.id,
    organizationId: r.organization_id,
    adAccountId: r.ad_account_id,
    locationId: r.location_id,
    externalId: r.external_id,
    source: r.source,
    goal: r.goal ? adGoal(r.goal) : null,
    status: r.status as CreativeStatus,
    concept: r.concept,
    headline: r.headline,
    primaryText: r.body,
    cta: r.cta,
    format: r.format,
    hook: r.hook,
    angle: r.angle as CreativeAngle | "",
    persona: r.persona,
    painPoint: r.pain_point,
    offer: r.offer,
    firstViewCopy: r.first_view_copy,
    visualDirection: r.visual_direction,
    videoScript: (r.video_script as unknown as VideoScript | null) ?? null,
    brief: (r.brief as unknown as CreativeBrief | null) ?? null,
    thumbnailUrl: r.thumbnail_url,
    landingPageUrl: r.landing_page_url,
    hypothesisId: r.hypothesis_id,
    parentCreativeId: r.parent_creative_id,
    variableChanged: r.variable_changed as TestVariable | null,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    rejectedReason: r.rejected_reason,
    aiProvider: r.ai_provider,
    createdAt: r.created_at,
  };
}

function creativeRow(c: Partial<NewCreative>): Tables["creatives"]["Update"] {
  const u: Tables["creatives"]["Update"] = {};
  if (c.organizationId !== undefined) u.organization_id = c.organizationId;
  if (c.adAccountId !== undefined) u.ad_account_id = c.adAccountId;
  if (c.locationId !== undefined) u.location_id = c.locationId;
  if (c.externalId !== undefined) u.external_id = c.externalId;
  if (c.source !== undefined) u.source = c.source;
  if (c.goal !== undefined) u.goal = c.goal;
  if (c.status !== undefined) u.status = c.status;
  if (c.concept !== undefined) u.concept = c.concept;
  if (c.headline !== undefined) u.headline = c.headline;
  if (c.primaryText !== undefined) u.body = c.primaryText;
  if (c.cta !== undefined) u.cta = c.cta;
  if (c.format !== undefined) u.format = c.format;
  if (c.hook !== undefined) u.hook = c.hook;
  if (c.angle !== undefined) u.angle = c.angle;
  if (c.persona !== undefined) u.persona = c.persona;
  if (c.painPoint !== undefined) u.pain_point = c.painPoint;
  if (c.offer !== undefined) u.offer = c.offer;
  if (c.firstViewCopy !== undefined) u.first_view_copy = c.firstViewCopy;
  if (c.visualDirection !== undefined) u.visual_direction = c.visualDirection;
  if (c.videoScript !== undefined) u.video_script = toJson(c.videoScript);
  if (c.brief !== undefined) u.brief = toJson(c.brief);
  if (c.thumbnailUrl !== undefined) u.thumbnail_url = c.thumbnailUrl;
  if (c.landingPageUrl !== undefined) u.landing_page_url = c.landingPageUrl;
  if (c.hypothesisId !== undefined) u.hypothesis_id = c.hypothesisId;
  if (c.parentCreativeId !== undefined) u.parent_creative_id = c.parentCreativeId;
  if (c.variableChanged !== undefined) u.variable_changed = c.variableChanged;
  if (c.approvedBy !== undefined) u.approved_by = c.approvedBy;
  if (c.approvedAt !== undefined) u.approved_at = c.approvedAt;
  if (c.rejectedReason !== undefined) u.rejected_reason = c.rejectedReason;
  if (c.aiProvider !== undefined) u.ai_provider = c.aiProvider;
  return u;
}

function toSnapshot(r: AdMetricSnapshotRow): AdMetricSnapshot {
  const raw = Object.fromEntries(Object.entries(asObject(r.raw_metrics)).filter((e): e is [string, number] => typeof e[1] === "number"));
  return {
    id: r.id,
    organizationId: r.organization_id,
    adAccountId: r.ad_account_id,
    locationId: r.location_id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    date: r.date,
    dateStop: r.date_stop,
    spend: Number(r.spend),
    impressions: Number(r.impressions),
    reach: num(r.reach),
    frequency: num(r.frequency),
    clicks: Number(r.clicks),
    landingPageViews: num(r.landing_page_views),
    conversions: Number(r.conversions),
    revenue: num(r.revenue),
    video3sViews: num(r.video_3s_views),
    thruplays: num(r.thruplays),
    ctr: num(r.ctr),
    cpc: num(r.cpc),
    cpm: num(r.cpm),
    cvr: num(r.cvr),
    cpa: num(r.cpa),
    roas: num(r.roas),
    rawMetrics: raw,
    source: r.source,
    capturedAt: r.captured_at,
  };
}

function toConversion(r: AdConversionRow): FirstPartyConversion {
  return {
    id: r.id,
    organizationId: r.organization_id,
    locationId: r.location_id,
    campaignId: r.campaign_id,
    adId: r.ad_id,
    kind: r.kind,
    occurredOn: r.occurred_on,
    count: Number(r.count),
    revenue: num(r.revenue),
    source: r.source,
    note: r.note,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

function toAnalysis(r: AiAdAnalysisRow): AiAdAnalysis {
  return {
    id: r.id,
    organizationId: r.organization_id,
    locationId: r.location_id,
    campaignId: r.campaign_id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    summary: r.summary,
    findings: Array.isArray(r.findings) ? (r.findings as unknown as AdFinding[]) : [],
    aiProvider: r.ai_provider,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

function toHypothesis(r: CreativeHypothesisRow): CreativeHypothesis {
  return {
    id: r.id,
    organizationId: r.organization_id,
    locationId: r.location_id,
    analysisId: r.analysis_id,
    campaignId: r.campaign_id,
    adSetId: r.ad_set_id,
    adId: r.ad_id,
    goal: adGoal(r.goal),
    problem: r.problem,
    hypothesis: r.hypothesis,
    changeVariable: r.change_variable as TestVariable,
    testIdea: r.test_idea,
    expectedResult: r.expected_result,
    primaryMetric: r.primary_metric as PrimaryMetric,
    confidence: Number(r.confidence),
    status: r.status as CreativeHypothesis["status"],
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    createdAt: r.created_at,
  };
}

function toVariant(r: ExperimentVariantRow): ExperimentVariant {
  return {
    id: r.id,
    organizationId: r.organization_id,
    experimentId: r.experiment_id,
    role: r.role,
    label: r.label,
    creativeId: r.creative_id,
    adId: r.ad_id,
    providerAdId: r.provider_ad_id,
    variableChanged: r.variable_changed,
    spend: Number(r.spend),
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    conversions: Number(r.conversions),
    revenue: num(r.revenue),
    frequency: num(r.frequency),
    ctr: num(r.ctr),
    cvr: num(r.cvr),
    cpa: num(r.cpa),
    roas: num(r.roas),
    decision: r.decision,
    metricsUpdatedAt: r.metrics_updated_at,
  };
}

function toExperiment(r: ExperimentRow, variants: ExperimentVariantRow[]): Experiment {
  return {
    id: r.id,
    organizationId: r.organization_id,
    locationId: r.location_id,
    campaignId: r.campaign_id,
    adSetId: r.ad_set_id,
    hypothesisId: r.hypothesis_id,
    name: r.name,
    goal: adGoal(r.goal),
    variable: r.variable as TestVariable,
    hypothesis: r.hypothesis,
    primaryMetric: r.primary_metric as PrimaryMetric,
    secondaryMetrics: r.secondary_metrics,
    criteria: asObject(r.criteria) as unknown as ExperimentCriteria,
    controlVariantId: r.control_variant_id,
    status: r.status,
    decision: r.decision,
    winnerVariantId: r.winner_variant_id,
    resultSummary: (r.result_summary as unknown as ExperimentResult | null) ?? null,
    startDate: r.start_date,
    endDate: r.end_date,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    launchedBy: r.launched_by,
    launchedAt: r.launched_at,
    completedBy: r.completed_by,
    completedAt: r.completed_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
    variants: variants
      .filter((v) => v.experiment_id === r.id)
      .map(toVariant)
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

/**
 * Supabase-backed AdsStore. The user's client reads (RLS, location scope);
 * the service-role client writes after lib/ads/access.ts authorized the user.
 * Partial unique indexes on external_id cannot be targeted by PostgREST
 * upserts, so sync upserts look up existing ids first (accounts have a few
 * hundred objects at most).
 */
export class SupabaseAdsStore implements AdsStore {
  constructor(
    private readonly db: AnySupabaseClient,
    readonly privileged: boolean,
  ) {}

  private requirePrivileged(context: string) {
    if (!this.privileged) throw new AdsStoreError(`${context}: privileged store required`, "forbidden");
  }

  private async existingIds(table: "campaigns" | "ad_sets" | "ads" | "creatives", organizationId: ID, externalIds: string[]): Promise<Map<string, ID>> {
    const map = new Map<string, ID>();
    if (!externalIds.length) return map;
    const { data, error } = await this.db.from(table).select("id, external_id").eq("organization_id", organizationId).in("external_id", externalIds);
    fail(error, `existing ${table}`);
    for (const r of data ?? []) if (r.external_id) map.set(r.external_id, r.id);
    return map;
  }

  // ---------------------------------------------------------------- accounts
  async listAdAccounts(organizationId: ID) {
    const { data, error } = await this.db.from("ad_accounts").select("*").eq("organization_id", organizationId).order("created_at");
    fail(error, "listAdAccounts");
    return (data ?? []).map(toAccount);
  }

  async upsertAdAccount(input: NewAdAccount): Promise<AdAccount> {
    this.requirePrivileged("upsertAdAccount");
    const { data, error } = await this.db
      .from("ad_accounts")
      .upsert(
        {
          organization_id: input.organizationId,
          brand_id: input.brandId,
          location_id: input.locationId,
          provider: input.provider,
          business_id: input.businessId,
          external_account_id: input.externalAccountId,
          name: input.name,
          currency: input.currency,
          timezone: input.timezone,
          account_status: input.accountStatus,
          connection_status: input.connectionStatus,
          scopes: input.scopes,
          token_expires_at: input.tokenExpiresAt,
          last_synced_at: input.lastSyncedAt,
          connection_error: input.connectionError ? sanitize(input.connectionError) : null,
          metadata: toJson(input.metadata),
          connected_at: input.connectionStatus === "connected" ? nowIso() : null,
        },
        { onConflict: "organization_id,provider,external_account_id" },
      )
      .select("*")
      .single();
    fail(error, "upsertAdAccount");
    return toAccount(data as AdAccountRow);
  }

  async updateAdAccount(organizationId: ID, id: ID, patch: Partial<Omit<AdAccount, "id" | "organizationId">>) {
    this.requirePrivileged("updateAdAccount");
    const u: Tables["ad_accounts"]["Update"] = {};
    if (patch.brandId !== undefined) u.brand_id = patch.brandId;
    if (patch.locationId !== undefined) u.location_id = patch.locationId;
    if (patch.businessId !== undefined) u.business_id = patch.businessId;
    if (patch.name !== undefined) u.name = patch.name;
    if (patch.currency !== undefined) u.currency = patch.currency;
    if (patch.timezone !== undefined) u.timezone = patch.timezone;
    if (patch.accountStatus !== undefined) u.account_status = patch.accountStatus;
    if (patch.connectionStatus !== undefined) u.connection_status = patch.connectionStatus;
    if (patch.scopes !== undefined) u.scopes = patch.scopes;
    if (patch.tokenExpiresAt !== undefined) u.token_expires_at = patch.tokenExpiresAt;
    if (patch.lastSyncedAt !== undefined) u.last_synced_at = patch.lastSyncedAt;
    if (patch.connectionError !== undefined) u.connection_error = patch.connectionError ? sanitize(patch.connectionError) : null;
    if (patch.metadata !== undefined) u.metadata = toJson(patch.metadata);
    const { error } = await this.db.from("ad_accounts").update(u).eq("id", id).eq("organization_id", organizationId);
    fail(error, "updateAdAccount");
  }

  async saveAdCredential(organizationId: ID, adAccountId: ID, token: { accessToken: string; expiresAt: string | null; scopes: string[] }) {
    this.requirePrivileged("saveAdCredential");
    const { error } = await this.db.from("ad_account_credentials").upsert(
      {
        ad_account_id: adAccountId,
        organization_id: organizationId,
        access_token_ciphertext: encryptSecret(token.accessToken),
        token_expires_at: token.expiresAt,
        scopes: token.scopes,
        last_refreshed_at: nowIso(),
      },
      { onConflict: "ad_account_id" },
    );
    fail(error, "saveAdCredential");
  }

  async getAdCredential(organizationId: ID, adAccountId: ID) {
    this.requirePrivileged("getAdCredential");
    const { data, error } = await this.db.from("ad_account_credentials").select("*").eq("ad_account_id", adAccountId).eq("organization_id", organizationId).maybeSingle();
    fail(error, "getAdCredential");
    return data ? { accessToken: decryptSecret(data.access_token_ciphertext), expiresAt: data.token_expires_at, scopes: data.scopes } : null;
  }

  async deleteAdCredential(organizationId: ID, adAccountId: ID) {
    this.requirePrivileged("deleteAdCredential");
    const { error } = await this.db.from("ad_account_credentials").delete().eq("ad_account_id", adAccountId).eq("organization_id", organizationId);
    fail(error, "deleteAdCredential");
  }

  async systemListAdAccounts() {
    this.requirePrivileged("systemListAdAccounts");
    const { data, error } = await this.db.from("ad_accounts").select("*").eq("connection_status", "connected");
    fail(error, "systemListAdAccounts");
    return (data ?? []).map(toAccount);
  }

  async getOrganizationIsDemo(organizationId: ID) {
    const { data, error } = await this.db.from("organizations").select("is_demo").eq("id", organizationId).maybeSingle();
    fail(error, "getOrganizationIsDemo");
    return data?.is_demo ?? false;
  }

  // --------------------------------------------------------------- structure
  async upsertCampaigns(organizationId: ID, adAccountId: ID, rows: SyncedCampaign[]) {
    this.requirePrivileged("upsertCampaigns");
    const existing = await this.existingIds("campaigns", organizationId, rows.map((r) => r.externalId).filter((x): x is string => !!x));
    const ids = new Map<string, ID>();
    const syncedAt = nowIso();
    for (const r of rows) {
      if (!r.externalId) continue;
      const synced = {
        name: r.name,
        objective: r.objective,
        status: r.status,
        effective_status: r.effectiveStatus,
        daily_budget: r.dailyBudget,
        lifetime_budget: r.lifetimeBudget,
        currency: r.currency,
        special_ad_categories: r.specialAdCategories,
        start_time: r.startTime,
        stop_time: r.stopTime,
        ad_account_id: adAccountId,
        last_synced_at: syncedAt,
      };
      const id = existing.get(r.externalId);
      if (id) {
        // human-owned fields (goal / LP / location / CV event) are only filled when empty
        const { data: cur } = await this.db.from("campaigns").select("landing_page_url, location_id, conversion_event").eq("id", id).single();
        const { error } = await this.db
          .from("campaigns")
          .update({
            ...synced,
            landing_page_url: cur?.landing_page_url ?? r.landingPageUrl ?? null,
            location_id: cur?.location_id ?? r.locationId ?? null,
            conversion_event: cur?.conversion_event ?? r.conversionEvent ?? null,
          })
          .eq("id", id);
        fail(error, "upsertCampaigns update");
        ids.set(r.externalId, id);
      } else {
        const { data, error } = await this.db
          .from("campaigns")
          .insert({
            ...synced,
            organization_id: organizationId,
            provider: "meta",
            external_id: r.externalId,
            goal: r.goal ?? "acquisition",
            landing_page_url: r.landingPageUrl ?? null,
            location_id: r.locationId ?? null,
            conversion_event: r.conversionEvent ?? null,
          })
          .select("id")
          .single();
        fail(error, "upsertCampaigns insert");
        ids.set(r.externalId, (data as { id: string }).id);
      }
    }
    return ids;
  }

  async upsertAdSets(organizationId: ID, rows: SyncedAdSet[], campaignIds: Map<string, ID>) {
    this.requirePrivileged("upsertAdSets");
    const existing = await this.existingIds("ad_sets", organizationId, rows.map((r) => r.externalId).filter((x): x is string => !!x));
    const campaignLocations = new Map<ID, ID | null>();
    if (campaignIds.size) {
      const { data } = await this.db.from("campaigns").select("id, location_id").in("id", [...campaignIds.values()]);
      for (const c of data ?? []) campaignLocations.set(c.id, c.location_id);
    }
    const ids = new Map<string, ID>();
    for (const { campaignExternalId, ...r } of rows) {
      const campaignId = campaignIds.get(campaignExternalId);
      if (!campaignId || !r.externalId) continue;
      const synced = {
        campaign_id: campaignId,
        name: r.name,
        status: r.status,
        effective_status: r.effectiveStatus,
        optimization_goal: r.optimizationGoal,
        billing_event: r.billingEvent,
        daily_budget: r.dailyBudget,
        targeting: toJson(r.targeting),
        last_synced_at: nowIso(),
      };
      const id = existing.get(r.externalId);
      if (id) {
        const { data: cur } = await this.db.from("ad_sets").select("audience_label").eq("id", id).single();
        const { error } = await this.db
          .from("ad_sets")
          .update({ ...synced, audience_label: cur?.audience_label || r.audienceLabel || "" })
          .eq("id", id);
        fail(error, "upsertAdSets update");
        ids.set(r.externalId, id);
      } else {
        const { data, error } = await this.db
          .from("ad_sets")
          .insert({ ...synced, organization_id: organizationId, external_id: r.externalId, audience_label: r.audienceLabel ?? "", location_id: r.locationId ?? campaignLocations.get(campaignId) ?? null })
          .select("id")
          .single();
        fail(error, "upsertAdSets insert");
        ids.set(r.externalId, (data as { id: string }).id);
      }
    }
    return ids;
  }

  async upsertSyncedCreatives(organizationId: ID, adAccountId: ID, rows: NewCreative[]) {
    this.requirePrivileged("upsertSyncedCreatives");
    const existing = await this.existingIds("creatives", organizationId, rows.map((r) => r.externalId).filter((x): x is string => !!x));
    const ids = new Map<string, ID>();
    for (const r of rows) {
      if (!r.externalId) continue;
      const id = existing.get(r.externalId);
      if (id) {
        // keep human / AI annotations (hook, angle, persona …)
        const { error } = await this.db
          .from("creatives")
          .update({ headline: r.headline, body: r.primaryText, cta: r.cta, thumbnail_url: r.thumbnailUrl, format: r.format, ad_account_id: adAccountId })
          .eq("id", id);
        fail(error, "upsertSyncedCreatives update");
        ids.set(r.externalId, id);
      } else {
        const insert = { ...creativeRow(r), organization_id: organizationId, ad_account_id: adAccountId } as Tables["creatives"]["Insert"];
        const { data, error } = await this.db.from("creatives").insert(insert).select("id").single();
        fail(error, "upsertSyncedCreatives insert");
        ids.set(r.externalId, (data as { id: string }).id);
      }
    }
    return ids;
  }

  async upsertAds(organizationId: ID, rows: SyncedAd[], ids: { campaigns: Map<string, ID>; adSets: Map<string, ID>; creatives: Map<string, ID> }) {
    this.requirePrivileged("upsertAds");
    const existing = await this.existingIds("ads", organizationId, rows.map((r) => r.externalId).filter((x): x is string => !!x));
    const campaignLocations = new Map<ID, ID | null>();
    if (ids.campaigns.size) {
      const { data } = await this.db.from("campaigns").select("id, location_id").in("id", [...ids.campaigns.values()]);
      for (const c of data ?? []) campaignLocations.set(c.id, c.location_id);
    }
    const out = new Map<string, ID>();
    for (const { campaignExternalId, adSetExternalId, creativeExternalId, ...r } of rows) {
      const adSetId = ids.adSets.get(adSetExternalId);
      if (!adSetId || !r.externalId) continue;
      const campaignId = ids.campaigns.get(campaignExternalId) ?? null;
      const creativeId = creativeExternalId ? (ids.creatives.get(creativeExternalId) ?? null) : null;
      const synced = {
        ad_set_id: adSetId,
        campaign_id: campaignId,
        name: r.name,
        status: r.status,
        effective_status: r.effectiveStatus,
        provider_created_at: r.providerCreatedAt,
        last_synced_at: nowIso(),
      };
      const id = existing.get(r.externalId);
      if (id) {
        const { data: cur } = await this.db.from("ads").select("landing_page_url, creative_id").eq("id", id).single();
        const { error } = await this.db
          .from("ads")
          .update({ ...synced, landing_page_url: cur?.landing_page_url ?? r.landingPageUrl, creative_id: creativeId ?? cur?.creative_id ?? null })
          .eq("id", id);
        fail(error, "upsertAds update");
        out.set(r.externalId, id);
      } else {
        const { data, error } = await this.db
          .from("ads")
          .insert({
            ...synced,
            organization_id: organizationId,
            external_id: r.externalId,
            creative_id: creativeId,
            landing_page_url: r.landingPageUrl,
            location_id: campaignId ? (campaignLocations.get(campaignId) ?? null) : null,
          })
          .select("id")
          .single();
        fail(error, "upsertAds insert");
        out.set(r.externalId, (data as { id: string }).id);
      }
    }
    return out;
  }

  async listCampaigns(organizationId: ID) {
    const { data, error } = await this.db.from("campaigns").select("*").eq("organization_id", organizationId).order("created_at");
    fail(error, "listCampaigns");
    return (data ?? []).map(toCampaign);
  }

  async updateCampaign(organizationId: ID, id: ID, patch: Partial<Pick<AdCampaign, "goal" | "landingPageUrl" | "locationId" | "conversionEvent">>) {
    this.requirePrivileged("updateCampaign");
    const u: Tables["campaigns"]["Update"] = {};
    if (patch.goal !== undefined) u.goal = patch.goal;
    if (patch.landingPageUrl !== undefined) u.landing_page_url = patch.landingPageUrl;
    if (patch.locationId !== undefined) u.location_id = patch.locationId;
    if (patch.conversionEvent !== undefined) u.conversion_event = patch.conversionEvent;
    const { error } = await this.db.from("campaigns").update(u).eq("id", id).eq("organization_id", organizationId);
    fail(error, "updateCampaign");
    if (patch.locationId !== undefined) {
      // location scope follows the campaign (RLS uses it)
      const a = await this.db.from("ad_sets").update({ location_id: patch.locationId }).eq("campaign_id", id).eq("organization_id", organizationId);
      fail(a.error, "updateCampaign ad_sets");
      const b = await this.db.from("ads").update({ location_id: patch.locationId }).eq("campaign_id", id).eq("organization_id", organizationId);
      fail(b.error, "updateCampaign ads");
    }
  }

  async listAdSets(organizationId: ID) {
    const { data, error } = await this.db.from("ad_sets").select("*").eq("organization_id", organizationId).order("created_at");
    fail(error, "listAdSets");
    return (data ?? []).map(toAdSet);
  }

  async listAds(organizationId: ID) {
    const { data, error } = await this.db.from("ads").select("*").eq("organization_id", organizationId).order("created_at");
    fail(error, "listAds");
    return (data ?? []).map(toAd);
  }

  async updateAd(organizationId: ID, id: ID, patch: Partial<Pick<AdRecord, "status" | "effectiveStatus" | "landingPageUrl">>) {
    this.requirePrivileged("updateAd");
    const u: Tables["ads"]["Update"] = {};
    if (patch.status !== undefined) u.status = patch.status;
    if (patch.effectiveStatus !== undefined) u.effective_status = patch.effectiveStatus;
    if (patch.landingPageUrl !== undefined) u.landing_page_url = patch.landingPageUrl;
    const { error } = await this.db.from("ads").update(u).eq("id", id).eq("organization_id", organizationId);
    fail(error, "updateAd");
  }

  async createAdRecord(organizationId: ID, input: Omit<AdRecord, "id" | "organizationId">) {
    this.requirePrivileged("createAdRecord");
    const { data, error } = await this.db
      .from("ads")
      .insert({
        organization_id: organizationId,
        campaign_id: input.campaignId,
        ad_set_id: input.adSetId,
        creative_id: input.creativeId,
        location_id: input.locationId,
        external_id: input.externalId,
        name: input.name,
        status: input.status,
        effective_status: input.effectiveStatus,
        landing_page_url: input.landingPageUrl,
        provider_created_at: input.providerCreatedAt,
      })
      .select("*")
      .single();
    fail(error, "createAdRecord");
    return toAd(data as AdRow);
  }

  // --------------------------------------------------------------- creatives
  async listCreatives(organizationId: ID) {
    const { data, error } = await this.db.from("creatives").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false });
    fail(error, "listCreatives");
    return (data ?? []).map(toCreative);
  }

  async getCreative(organizationId: ID, id: ID) {
    const { data, error } = await this.db.from("creatives").select("*").eq("organization_id", organizationId).eq("id", id).maybeSingle();
    fail(error, "getCreative");
    return data ? toCreative(data) : null;
  }

  async createCreative(input: NewCreative) {
    this.requirePrivileged("createCreative");
    const { data, error } = await this.db
      .from("creatives")
      .insert(creativeRow(input) as Tables["creatives"]["Insert"])
      .select("*")
      .single();
    fail(error, "createCreative");
    return toCreative(data as CreativeRow);
  }

  async updateCreative(organizationId: ID, id: ID, patch: CreativePatch) {
    this.requirePrivileged("updateCreative");
    const { data, error } = await this.db.from("creatives").update(creativeRow(patch)).eq("id", id).eq("organization_id", organizationId).select("*").maybeSingle();
    fail(error, "updateCreative");
    if (!data) throw new AdsStoreError("creative not found", "not_found");
    return toCreative(data);
  }

  // ----------------------------------------------------------------- metrics
  async upsertSnapshots(organizationId: ID, rows: NewSnapshot[]) {
    this.requirePrivileged("upsertSnapshots");
    const capturedAt = nowIso();
    const payload: Tables["ad_metric_snapshots"]["Insert"][] = rows.map((r) => {
      const d = derive(r);
      return {
        organization_id: organizationId,
        ad_account_id: r.adAccountId,
        location_id: r.locationId,
        entity_type: r.entityType,
        entity_id: r.entityId,
        date: r.date,
        date_stop: r.dateStop,
        spend: r.spend,
        impressions: r.impressions,
        reach: r.reach,
        frequency: r.frequency,
        clicks: r.clicks,
        landing_page_views: r.landingPageViews,
        conversions: r.conversions,
        revenue: r.revenue,
        video_3s_views: r.video3sViews,
        thruplays: r.thruplays,
        ctr: d.ctr,
        cpc: d.cpc,
        cpm: d.cpm,
        cvr: d.cvr,
        cpa: d.cpa,
        roas: d.roas,
        raw_metrics: toJson(r.rawMetrics),
        source: r.source,
        captured_at: capturedAt,
      };
    });
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await this.db.from("ad_metric_snapshots").upsert(payload.slice(i, i + 500), { onConflict: "organization_id,entity_type,entity_id,date" });
      fail(error, "upsertSnapshots");
    }
    return rows.length;
  }

  async listSnapshots(organizationId: ID, options: { entityType?: AdMetricSnapshot["entityType"]; entityIds?: ID[]; since?: string } = {}) {
    const out: AdMetricSnapshot[] = [];
    // PostgREST caps responses (default 1000 rows) → page through.
    for (let from = 0; ; from += 1000) {
      let q = this.db.from("ad_metric_snapshots").select("*").eq("organization_id", organizationId);
      if (options.entityType) q = q.eq("entity_type", options.entityType);
      if (options.entityIds) q = q.in("entity_id", options.entityIds.length ? options.entityIds : ["00000000-0000-0000-0000-000000000000"]);
      if (options.since) q = q.gte("date", options.since);
      const { data, error } = await q.order("date").order("id").range(from, from + 999);
      fail(error, "listSnapshots");
      out.push(...(data ?? []).map(toSnapshot));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  async addConversions(organizationId: ID, rows: Omit<FirstPartyConversion, "id" | "organizationId" | "createdAt">[]) {
    this.requirePrivileged("addConversions");
    if (!rows.length) return 0;
    const { error } = await this.db.from("ad_conversions").insert(
      rows.map((r) => ({
        organization_id: organizationId,
        location_id: r.locationId,
        campaign_id: r.campaignId,
        ad_id: r.adId,
        kind: r.kind,
        occurred_on: r.occurredOn,
        count: r.count,
        revenue: r.revenue,
        source: r.source,
        note: r.note,
        created_by: r.createdBy,
      })),
    );
    fail(error, "addConversions");
    return rows.length;
  }

  async listConversions(organizationId: ID, options: { since?: string } = {}) {
    let q = this.db.from("ad_conversions").select("*").eq("organization_id", organizationId);
    if (options.since) q = q.gte("occurred_on", options.since);
    const { data, error } = await q.order("occurred_on", { ascending: false }).limit(1000);
    fail(error, "listConversions");
    return (data ?? []).map(toConversion);
  }

  // ------------------------------------------- analyses / hypotheses / tests
  async addAnalysis(input: Omit<AiAdAnalysis, "id" | "createdAt">) {
    this.requirePrivileged("addAnalysis");
    const { data, error } = await this.db
      .from("ai_ad_analyses")
      .insert({
        organization_id: input.organizationId,
        location_id: input.locationId,
        campaign_id: input.campaignId,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        summary: input.summary,
        findings: toJson(input.findings),
        ai_provider: input.aiProvider,
        created_by: input.createdBy,
      })
      .select("*")
      .single();
    fail(error, "addAnalysis");
    return toAnalysis(data as AiAdAnalysisRow);
  }

  async listAnalyses(organizationId: ID, limit = 20) {
    const { data, error } = await this.db.from("ai_ad_analyses").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(limit);
    fail(error, "listAnalyses");
    return (data ?? []).map(toAnalysis);
  }

  async addHypotheses(rows: NewHypothesis[]) {
    this.requirePrivileged("addHypotheses");
    if (!rows.length) return [];
    const { data, error } = await this.db
      .from("creative_hypotheses")
      .insert(
        rows.map((r) => ({
          organization_id: r.organizationId,
          location_id: r.locationId,
          analysis_id: r.analysisId,
          campaign_id: r.campaignId,
          ad_set_id: r.adSetId,
          ad_id: r.adId,
          goal: r.goal,
          problem: r.problem,
          hypothesis: r.hypothesis,
          change_variable: r.changeVariable,
          test_idea: r.testIdea,
          expected_result: r.expectedResult,
          primary_metric: r.primaryMetric,
          confidence: r.confidence,
          status: r.status ?? "proposed",
        })),
      )
      .select("*");
    fail(error, "addHypotheses");
    return (data ?? []).map(toHypothesis);
  }

  async listHypotheses(organizationId: ID) {
    const { data, error } = await this.db.from("creative_hypotheses").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false });
    fail(error, "listHypotheses");
    return (data ?? []).map(toHypothesis);
  }

  async updateHypothesis(organizationId: ID, id: ID, patch: Partial<Pick<CreativeHypothesis, "status" | "decidedBy" | "decidedAt">>) {
    this.requirePrivileged("updateHypothesis");
    const u: Tables["creative_hypotheses"]["Update"] = {};
    if (patch.status !== undefined) u.status = patch.status;
    if (patch.decidedBy !== undefined) u.decided_by = patch.decidedBy;
    if (patch.decidedAt !== undefined) u.decided_at = patch.decidedAt;
    const { error } = await this.db.from("creative_hypotheses").update(u).eq("id", id).eq("organization_id", organizationId);
    fail(error, "updateHypothesis");
  }

  private async loadExperiments(organizationId: ID, ids?: ID[]): Promise<Experiment[]> {
    let q = this.db.from("experiments").select("*").eq("organization_id", organizationId);
    if (ids) q = q.in("id", ids);
    const { data, error } = await q.order("created_at", { ascending: false });
    fail(error, "listExperiments");
    const rows = data ?? [];
    if (!rows.length) return [];
    const { data: variants, error: vErr } = await this.db
      .from("experiment_variants")
      .select("*")
      .eq("organization_id", organizationId)
      .in(
        "experiment_id",
        rows.map((r) => r.id),
      );
    fail(vErr, "listExperimentVariants");
    return rows.map((r) => toExperiment(r, variants ?? []));
  }

  async createExperiment(input: NewExperiment) {
    this.requirePrivileged("createExperiment");
    const { data, error } = await this.db
      .from("experiments")
      .insert({
        organization_id: input.organizationId,
        location_id: input.locationId,
        campaign_id: input.campaignId,
        ad_set_id: input.adSetId,
        hypothesis_id: input.hypothesisId,
        name: input.name,
        goal: input.goal,
        variable: input.variable,
        hypothesis: input.hypothesis,
        primary_metric: input.primaryMetric,
        secondary_metrics: input.secondaryMetrics,
        criteria: toJson(input.criteria),
        status: input.status,
        start_date: input.startDate,
        end_date: input.endDate,
        created_by: input.createdBy,
      })
      .select("id")
      .single();
    fail(error, "createExperiment");
    const experimentId = (data as { id: string }).id;
    const { data: variants, error: vErr } = await this.db
      .from("experiment_variants")
      .insert(
        input.variants.map((v) => ({
          organization_id: input.organizationId,
          experiment_id: experimentId,
          role: v.role,
          label: v.label,
          creative_id: v.creativeId,
          ad_id: v.adId,
          provider_ad_id: v.providerAdId,
          variable_changed: v.variableChanged,
          spend: v.spend,
          impressions: v.impressions,
          clicks: v.clicks,
          conversions: v.conversions,
          revenue: v.revenue,
          frequency: v.frequency,
          ctr: v.ctr,
          cvr: v.cvr,
          cpa: v.cpa,
          roas: v.roas,
        })),
      )
      .select("id, role");
    if (vErr) {
      await this.db.from("experiments").delete().eq("id", experimentId);
      fail(vErr, "createExperimentVariants");
    }
    const control = (variants ?? []).find((v) => v.role === "control");
    if (control) {
      const { error: cErr } = await this.db.from("experiments").update({ control_variant_id: control.id }).eq("id", experimentId);
      fail(cErr, "createExperiment control");
    }
    const [created] = await this.loadExperiments(input.organizationId, [experimentId]);
    if (!created) throw new AdsStoreError("experiment not found after insert", "unknown");
    return created;
  }

  async getExperiment(organizationId: ID, id: ID) {
    const [e] = await this.loadExperiments(organizationId, [id]);
    return e ?? null;
  }

  async listExperiments(organizationId: ID) {
    return this.loadExperiments(organizationId);
  }

  async updateExperiment(organizationId: ID, id: ID, patch: ExperimentPatch, expect?: { statuses: Experiment["status"][]; notLaunched?: boolean }) {
    this.requirePrivileged("updateExperiment");
    const u: Tables["experiments"]["Update"] = {};
    if (patch.status !== undefined) u.status = patch.status;
    if (patch.decision !== undefined) u.decision = patch.decision;
    if (patch.winnerVariantId !== undefined) u.winner_variant_id = patch.winnerVariantId;
    if (patch.resultSummary !== undefined) u.result_summary = toJson(patch.resultSummary);
    if (patch.startDate !== undefined) u.start_date = patch.startDate;
    if (patch.endDate !== undefined) u.end_date = patch.endDate;
    if (patch.approvedBy !== undefined) u.approved_by = patch.approvedBy;
    if (patch.approvedAt !== undefined) u.approved_at = patch.approvedAt;
    if (patch.launchedBy !== undefined) u.launched_by = patch.launchedBy;
    if (patch.launchedAt !== undefined) u.launched_at = patch.launchedAt;
    if (patch.completedBy !== undefined) u.completed_by = patch.completedBy;
    if (patch.completedAt !== undefined) u.completed_at = patch.completedAt;
    if (patch.criteria !== undefined) u.criteria = toJson(patch.criteria);
    if (patch.name !== undefined) u.name = patch.name;
    // compare-and-set on status so two approvers cannot launch twice
    let q = this.db.from("experiments").update(u).eq("id", id).eq("organization_id", organizationId);
    if (expect) q = q.in("status", expect.statuses);
    if (expect?.notLaunched) q = q.is("launched_at", null);
    const { data, error } = await q.select("id");
    fail(error, "updateExperiment");
    if (!data?.length) return null;
    return this.getExperiment(organizationId, id);
  }

  async updateVariant(organizationId: ID, variantId: ID, patch: VariantPatch) {
    this.requirePrivileged("updateVariant");
    const u: Tables["experiment_variants"]["Update"] = {};
    if (patch.creativeId !== undefined) u.creative_id = patch.creativeId;
    if (patch.adId !== undefined) u.ad_id = patch.adId;
    if (patch.providerAdId !== undefined) u.provider_ad_id = patch.providerAdId;
    if (patch.variableChanged !== undefined) u.variable_changed = patch.variableChanged;
    for (const k of ["spend", "impressions", "clicks", "conversions"] as const) if (patch[k] !== undefined) u[k] = patch[k];
    for (const k of ["revenue", "frequency", "ctr", "cvr", "cpa", "roas"] as const) if (patch[k] !== undefined) u[k] = patch[k];
    if (patch.decision !== undefined) u.decision = patch.decision;
    if (patch.metricsUpdatedAt !== undefined) u.metrics_updated_at = patch.metricsUpdatedAt;
    const { data, error } = await this.db.from("experiment_variants").update(u).eq("id", variantId).eq("organization_id", organizationId).select("id");
    fail(error, "updateVariant");
    if (!data?.length) throw new AdsStoreError("variant not found", "not_found");
  }
}
