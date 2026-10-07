import "server-only";
import type { ID } from "@/lib/domain/types";
import { getDemoStore, newId, persistDemoStore } from "@/lib/data/demo-store";
import { decryptSecret, encryptSecret } from "@/lib/social/crypto";
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
import type { AdAccount, AdCampaign, AdCreativeRecord, AdMetricSnapshot, AdRecord, AiAdAnalysis, CreativeHypothesis, Experiment, FirstPartyConversion } from "./types";

const nowIso = () => new Date().toISOString();
const clone = <T>(v: T): T => structuredClone(v);

/** In-memory AdsStore for Demo Mode (organization-scoped like the Supabase store). */
export class DemoAdsStore implements AdsStore {
  readonly privileged = true;
  constructor(private readonly idGen: () => ID = newId) {}

  private get d() {
    return getDemoStore().ads;
  }
  private save() {
    persistDemoStore();
  }

  async listAdAccounts(organizationId: ID) {
    return clone(this.d.accounts.filter((a) => a.organizationId === organizationId));
  }
  async upsertAdAccount(input: NewAdAccount): Promise<AdAccount> {
    const existing = this.d.accounts.find((a) => a.organizationId === input.organizationId && a.externalAccountId === input.externalAccountId);
    if (existing) {
      Object.assign(existing, input);
      this.save();
      return clone(existing);
    }
    const account: AdAccount = { ...clone(input), id: this.idGen() };
    this.d.accounts.push(account);
    this.save();
    return clone(account);
  }
  async updateAdAccount(organizationId: ID, id: ID, patch: Partial<AdAccount>) {
    const a = this.d.accounts.find((x) => x.id === id && x.organizationId === organizationId);
    if (!a) throw new AdsStoreError("ad account not found", "not_found");
    Object.assign(a, patch);
    this.save();
  }
  async saveAdCredential(organizationId: ID, adAccountId: ID, token: { accessToken: string; expiresAt: string | null; scopes: string[] }) {
    this.d.credentials = this.d.credentials.filter((c) => !(c.organizationId === organizationId && c.adAccountId === adAccountId));
    this.d.credentials.push({ organizationId, adAccountId, ciphertext: encryptSecret(token.accessToken), expiresAt: token.expiresAt, scopes: [...token.scopes] });
    this.save();
  }
  async getAdCredential(organizationId: ID, adAccountId: ID) {
    const c = this.d.credentials.find((x) => x.organizationId === organizationId && x.adAccountId === adAccountId);
    return c ? { accessToken: decryptSecret(c.ciphertext), expiresAt: c.expiresAt, scopes: [...c.scopes] } : null;
  }
  async deleteAdCredential(organizationId: ID, adAccountId: ID) {
    this.d.credentials = this.d.credentials.filter((c) => !(c.organizationId === organizationId && c.adAccountId === adAccountId));
    this.save();
  }
  async systemListAdAccounts() {
    return clone(this.d.accounts.filter((a) => a.connectionStatus === "connected"));
  }
  async getOrganizationIsDemo(organizationId: ID) {
    return getDemoStore().organizations.find((o) => o.id === organizationId)?.isDemo ?? false;
  }

  async upsertCampaigns(organizationId: ID, adAccountId: ID, rows: SyncedCampaign[]) {
    const ids = new Map<string, ID>();
    for (const r of rows) {
      const existing = this.d.campaigns.find((c) => c.organizationId === organizationId && c.externalId === r.externalId);
      if (existing) {
        // human-owned fields (goal / LP / location / CV event) are kept
        Object.assign(existing, { ...r, goal: existing.goal, landingPageUrl: existing.landingPageUrl ?? r.landingPageUrl ?? null, locationId: existing.locationId ?? r.locationId ?? null, conversionEvent: existing.conversionEvent ?? r.conversionEvent ?? null, adAccountId });
        ids.set(r.externalId as string, existing.id);
      } else {
        const c: AdCampaign = { goal: "acquisition", landingPageUrl: null, locationId: null, conversionEvent: null, ...clone(r), id: this.idGen(), organizationId, adAccountId };
        this.d.campaigns.push(c);
        ids.set(r.externalId as string, c.id);
      }
    }
    this.save();
    return ids;
  }
  async upsertAdSets(organizationId: ID, rows: SyncedAdSet[], campaignIds: Map<string, ID>) {
    const ids = new Map<string, ID>();
    for (const { campaignExternalId, ...r } of rows) {
      const campaignId = campaignIds.get(campaignExternalId);
      if (!campaignId) continue;
      const campaign = this.d.campaigns.find((c) => c.id === campaignId);
      const existing = this.d.adSets.find((s) => s.organizationId === organizationId && s.externalId === r.externalId);
      if (existing) {
        Object.assign(existing, { ...r, audienceLabel: existing.audienceLabel || r.audienceLabel || "", campaignId });
        ids.set(r.externalId as string, existing.id);
      } else {
        const s = { audienceLabel: "", ...clone(r), id: this.idGen(), organizationId, campaignId, locationId: r.locationId ?? campaign?.locationId ?? null };
        this.d.adSets.push(s);
        ids.set(r.externalId as string, s.id);
      }
    }
    this.save();
    return ids;
  }
  async upsertSyncedCreatives(organizationId: ID, adAccountId: ID, rows: NewCreative[]) {
    const ids = new Map<string, ID>();
    for (const r of rows) {
      const existing = this.d.creatives.find((c) => c.organizationId === organizationId && c.externalId === r.externalId);
      if (existing) {
        // keep human / AI annotations (hook, angle, persona …)
        Object.assign(existing, { headline: r.headline, primaryText: r.primaryText, cta: r.cta, thumbnailUrl: r.thumbnailUrl, format: r.format, adAccountId });
        ids.set(r.externalId as string, existing.id);
      } else {
        const c: AdCreativeRecord = { ...clone(r), id: this.idGen(), adAccountId, createdAt: nowIso() };
        this.d.creatives.push(c);
        ids.set(r.externalId as string, c.id);
      }
    }
    this.save();
    return ids;
  }
  async upsertAds(organizationId: ID, rows: SyncedAd[], ids: { campaigns: Map<string, ID>; adSets: Map<string, ID>; creatives: Map<string, ID> }) {
    const out = new Map<string, ID>();
    for (const { campaignExternalId, adSetExternalId, creativeExternalId, ...r } of rows) {
      const adSetId = ids.adSets.get(adSetExternalId);
      if (!adSetId) continue;
      const campaignId = ids.campaigns.get(campaignExternalId) ?? null;
      const creativeId = creativeExternalId ? (ids.creatives.get(creativeExternalId) ?? null) : null;
      const locationId = this.d.campaigns.find((c) => c.id === campaignId)?.locationId ?? null;
      const existing = this.d.ads.find((a) => a.organizationId === organizationId && a.externalId === r.externalId);
      if (existing) {
        Object.assign(existing, { ...r, landingPageUrl: existing.landingPageUrl ?? r.landingPageUrl, campaignId, adSetId, creativeId: creativeId ?? existing.creativeId });
        out.set(r.externalId as string, existing.id);
      } else {
        const a: AdRecord = { ...clone(r), id: this.idGen(), organizationId, campaignId, adSetId, creativeId, locationId };
        this.d.ads.push(a);
        out.set(r.externalId as string, a.id);
      }
    }
    this.save();
    return out;
  }
  async listCampaigns(organizationId: ID) {
    return clone(this.d.campaigns.filter((c) => c.organizationId === organizationId));
  }
  async updateCampaign(organizationId: ID, id: ID, patch: Partial<AdCampaign>) {
    const c = this.d.campaigns.find((x) => x.id === id && x.organizationId === organizationId);
    if (!c) throw new AdsStoreError("campaign not found", "not_found");
    Object.assign(c, patch);
    if (patch.locationId !== undefined) {
      // location scope follows the campaign (RLS / store filters use it)
      for (const s of this.d.adSets) if (s.campaignId === id) s.locationId = patch.locationId;
      for (const a of this.d.ads) if (a.campaignId === id) a.locationId = patch.locationId;
    }
    this.save();
  }
  async listAdSets(organizationId: ID) {
    return clone(this.d.adSets.filter((s) => s.organizationId === organizationId));
  }
  async listAds(organizationId: ID) {
    return clone(this.d.ads.filter((a) => a.organizationId === organizationId));
  }
  async updateAd(organizationId: ID, id: ID, patch: Partial<AdRecord>) {
    const a = this.d.ads.find((x) => x.id === id && x.organizationId === organizationId);
    if (!a) throw new AdsStoreError("ad not found", "not_found");
    Object.assign(a, patch);
    this.save();
  }
  async createAdRecord(organizationId: ID, input: Omit<AdRecord, "id" | "organizationId">) {
    const a: AdRecord = { ...clone(input), id: this.idGen(), organizationId };
    this.d.ads.push(a);
    this.save();
    return clone(a);
  }

  async listCreatives(organizationId: ID) {
    return clone(this.d.creatives.filter((c) => c.organizationId === organizationId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  async getCreative(organizationId: ID, id: ID) {
    const c = this.d.creatives.find((x) => x.id === id && x.organizationId === organizationId);
    return c ? clone(c) : null;
  }
  async createCreative(input: NewCreative) {
    const c: AdCreativeRecord = { ...clone(input), id: this.idGen(), createdAt: nowIso() };
    this.d.creatives.push(c);
    this.save();
    return clone(c);
  }
  async updateCreative(organizationId: ID, id: ID, patch: CreativePatch) {
    const c = this.d.creatives.find((x) => x.id === id && x.organizationId === organizationId);
    if (!c) throw new AdsStoreError("creative not found", "not_found");
    Object.assign(c, clone(patch));
    this.save();
    return clone(c);
  }

  async upsertSnapshots(organizationId: ID, rows: NewSnapshot[]) {
    const index = new Map(this.d.snapshots.filter((s) => s.organizationId === organizationId).map((s) => [`${s.entityType}:${s.entityId}:${s.date}`, s]));
    for (const r of rows) {
      const key = `${r.entityType}:${r.entityId}:${r.date}`;
      const existing = index.get(key);
      const row: AdMetricSnapshot = { ...r, ...derive(r), id: existing?.id ?? this.idGen(), organizationId, capturedAt: nowIso() };
      if (existing) Object.assign(existing, row);
      else {
        this.d.snapshots.push(row);
        index.set(key, row);
      }
    }
    this.save();
    return rows.length;
  }
  async listSnapshots(organizationId: ID, options: { entityType?: AdMetricSnapshot["entityType"]; entityIds?: ID[]; since?: string } = {}) {
    const ids = options.entityIds ? new Set(options.entityIds) : null;
    return clone(
      this.d.snapshots
        .filter((s) => s.organizationId === organizationId && (!options.entityType || s.entityType === options.entityType) && (!ids || ids.has(s.entityId)) && (!options.since || s.date >= options.since))
        .sort((a, b) => a.date.localeCompare(b.date)),
    );
  }
  async addConversions(organizationId: ID, rows: Omit<FirstPartyConversion, "id" | "organizationId" | "createdAt">[]) {
    for (const r of rows) this.d.conversions.push({ ...clone(r), id: this.idGen(), organizationId, createdAt: nowIso() });
    this.save();
    return rows.length;
  }
  async listConversions(organizationId: ID, options: { since?: string } = {}) {
    return clone(this.d.conversions.filter((c) => c.organizationId === organizationId && (!options.since || c.occurredOn >= options.since)).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)));
  }

  async addAnalysis(input: Omit<AiAdAnalysis, "id" | "createdAt">) {
    const a: AiAdAnalysis = { ...clone(input), id: this.idGen(), createdAt: nowIso() };
    this.d.analyses.push(a);
    this.save();
    return clone(a);
  }
  async listAnalyses(organizationId: ID, limit = 20) {
    return clone(this.d.analyses.filter((a) => a.organizationId === organizationId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit));
  }
  async addHypotheses(rows: NewHypothesis[]) {
    const out = rows.map((r): CreativeHypothesis => ({ status: "proposed", ...clone(r), id: this.idGen(), decidedBy: null, decidedAt: null, createdAt: nowIso() }));
    this.d.hypotheses.push(...out);
    this.save();
    return clone(out);
  }
  async listHypotheses(organizationId: ID) {
    return clone(this.d.hypotheses.filter((h) => h.organizationId === organizationId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  async updateHypothesis(organizationId: ID, id: ID, patch: Partial<CreativeHypothesis>) {
    const h = this.d.hypotheses.find((x) => x.id === id && x.organizationId === organizationId);
    if (!h) throw new AdsStoreError("hypothesis not found", "not_found");
    Object.assign(h, patch);
    this.save();
  }
  async createExperiment(input: NewExperiment) {
    const id = this.idGen();
    const variants = input.variants.map((v) => ({ ...clone(v), id: this.idGen(), organizationId: input.organizationId, experimentId: id, decision: null, metricsUpdatedAt: null }));
    const e: Experiment = {
      ...clone(input),
      id,
      variants,
      controlVariantId: variants.find((v) => v.role === "control")?.id ?? null,
      decision: null,
      winnerVariantId: null,
      resultSummary: null,
      approvedBy: null,
      approvedAt: null,
      launchedBy: null,
      launchedAt: null,
      completedBy: null,
      completedAt: null,
      createdAt: nowIso(),
    };
    this.d.experiments.push(e);
    this.save();
    return clone(e);
  }
  async getExperiment(organizationId: ID, id: ID) {
    const e = this.d.experiments.find((x) => x.id === id && x.organizationId === organizationId);
    return e ? clone(e) : null;
  }
  async listExperiments(organizationId: ID) {
    return clone(this.d.experiments.filter((e) => e.organizationId === organizationId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  async updateExperiment(organizationId: ID, id: ID, patch: ExperimentPatch, expect?: { statuses: Experiment["status"][]; notLaunched?: boolean }) {
    const e = this.d.experiments.find((x) => x.id === id && x.organizationId === organizationId);
    if (!e || (expect && !expect.statuses.includes(e.status)) || (expect?.notLaunched && e.launchedAt)) return null;
    Object.assign(e, clone(patch));
    this.save();
    return clone(e);
  }
  async updateVariant(organizationId: ID, variantId: ID, patch: VariantPatch) {
    for (const e of this.d.experiments) {
      if (e.organizationId !== organizationId) continue;
      const v = e.variants.find((x) => x.id === variantId);
      if (v) {
        Object.assign(v, clone(patch));
        this.save();
        return;
      }
    }
    throw new AdsStoreError("variant not found", "not_found");
  }
}
