/**
 * Ad optimization domain types (provider-independent). Meta specifics stay in
 * lib/ads/meta; UI and services only see these.
 */
import type { ID } from "@/lib/domain/types";

export type AdGoal = "acquisition" | "recruitment";

export interface AdAccount {
  id: ID;
  organizationId: ID;
  brandId: ID | null;
  locationId: ID | null;
  provider: "meta";
  businessId: string | null;
  externalAccountId: string; // act_<id>
  name: string;
  currency: string;
  timezone: string;
  accountStatus: string | null;
  connectionStatus: "connected" | "expired" | "error" | "disconnected" | "reauthorization_required";
  scopes: string[];
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
  connectionError: string | null;
  metadata: Record<string, string | number | boolean | null>;
}

export interface AdCampaign {
  id: ID;
  organizationId: ID;
  adAccountId: ID | null;
  locationId: ID | null;
  externalId: string | null;
  name: string;
  objective: string | null;
  goal: AdGoal;
  status: string;
  effectiveStatus: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  currency: string;
  specialAdCategories: string[];
  landingPageUrl: string | null;
  conversionEvent: string | null;
  startTime: string | null;
  stopTime: string | null;
  lastSyncedAt: string | null;
}

export interface AdSetRecord {
  id: ID;
  organizationId: ID;
  campaignId: ID;
  locationId: ID | null;
  externalId: string | null;
  name: string;
  status: string;
  effectiveStatus: string | null;
  optimizationGoal: string | null;
  billingEvent: string | null;
  dailyBudget: number | null;
  audienceLabel: string;
  targeting: Record<string, unknown> | null;
}

export interface AdRecord {
  id: ID;
  organizationId: ID;
  campaignId: ID | null;
  adSetId: ID;
  creativeId: ID | null;
  locationId: ID | null;
  externalId: string | null;
  name: string;
  status: string;
  effectiveStatus: string | null;
  landingPageUrl: string | null;
  providerCreatedAt: string | null;
}

export const CREATIVE_ANGLES = [
  "problem",
  "desire",
  "before_after",
  "expertise",
  "social_proof",
  "myth_busting",
  "how_to",
  "comparison",
  "urgency",
  "offer",
  "lifestyle",
  "identity",
  "career",
  "culture",
  "training",
  "salary",
  "global_opportunity",
  "employee_story",
] as const;
export type CreativeAngle = (typeof CREATIVE_ANGLES)[number];

export const TEST_VARIABLES = [
  "hook",
  "visual",
  "persona",
  "offer",
  "cta",
  "social_proof",
  "before_after",
  "problem_angle",
  "expertise_angle",
  "price",
  "format",
  "landing_page",
] as const;
export type TestVariable = (typeof TEST_VARIABLES)[number];

export type CreativeStatus = "draft" | "in_review" | "approved" | "rejected" | "published" | "archived" | "active" | "paused";

export interface VideoScript {
  hook: string;
  scenes: { seconds: string; visual: string; onScreenText: string; narration: string }[];
}

export interface CreativeBrief {
  goal: string;
  persona: string;
  painPoint: string;
  coreMessage: string;
  hook: string;
  angle: CreativeAngle;
  proof: string;
  cta: string;
  visualDirection: string;
  sceneStructure: string[];
  requiredAssets: string[];
  forbiddenExpressions: string[];
  brandTone: string;
  policyNotes: string[];
}

export interface AdCreativeRecord {
  id: ID;
  organizationId: ID;
  adAccountId: ID | null;
  locationId: ID | null;
  externalId: string | null;
  source: "synced" | "ai_generated" | "manual";
  goal: AdGoal | null;
  status: CreativeStatus;
  concept: string;
  headline: string;
  primaryText: string;
  cta: string;
  format: string | null;
  hook: string;
  angle: CreativeAngle | "";
  persona: string;
  painPoint: string;
  offer: string;
  firstViewCopy: string;
  visualDirection: string;
  videoScript: VideoScript | null;
  brief: CreativeBrief | null;
  thumbnailUrl: string | null;
  landingPageUrl: string | null;
  hypothesisId: ID | null;
  parentCreativeId: ID | null;
  variableChanged: TestVariable | null;
  approvedBy: ID | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  aiProvider: string | null;
  createdAt: string;
}

export type EntityType = "account" | "campaign" | "ad_set" | "ad";

/** One day of delivery for one entity (provider-reported). */
export interface AdDailyMetrics {
  spend: number;
  impressions: number;
  reach: number | null;
  frequency: number | null;
  clicks: number; // link clicks
  landingPageViews: number | null;
  conversions: number; // goal event (reservation / lead / application …)
  revenue: number | null;
  video3sViews: number | null;
  thruplays: number | null;
}

export interface AdMetricSnapshot extends AdDailyMetrics {
  id: ID;
  organizationId: ID;
  adAccountId: ID | null;
  locationId: ID | null;
  entityType: EntityType;
  entityId: ID;
  date: string; // YYYY-MM-DD
  dateStop: string;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cvr: number | null;
  cpa: number | null;
  roas: number | null;
  rawMetrics: Record<string, number>;
  source: "provider" | "mock";
  capturedAt: string;
}

export const CONVERSION_KINDS = ["lead", "reservation", "visit", "contract", "application", "revenue"] as const;
export type ConversionKind = (typeof CONVERSION_KINDS)[number];

/** First-party conversion (manual / CSV / API). Never mixed with provider-reported numbers. */
export interface FirstPartyConversion {
  id: ID;
  organizationId: ID;
  locationId: ID | null;
  campaignId: ID | null;
  adId: ID | null;
  kind: ConversionKind;
  occurredOn: string;
  count: number;
  revenue: number | null;
  source: "manual" | "csv" | "api";
  note: string;
  createdBy: ID | null;
  createdAt: string;
}

export type FindingKind =
  | "creative_fatigue"
  | "ctr_drop"
  | "lp_cvr_drop"
  | "cpa_spike"
  | "cpc_rise"
  | "frequency_high"
  | "underdelivery"
  | "cv_stopped"
  | "winning_creative"
  | "scale_opportunity";

export type FunnelStage = "impression" | "click" | "landing_page" | "conversion" | "delivery";

export interface Evidence {
  metric: string;
  current: number | null;
  baseline: number | null;
  changePct: number | null;
  window: string;
}

export interface AdFinding {
  id: string;
  kind: FindingKind;
  severity: "high" | "medium" | "low";
  type: "problem" | "opportunity";
  entityType: EntityType;
  entityId: ID;
  entityName: string;
  campaignId: ID | null;
  locationId: ID | null;
  goal: AdGoal;
  stage: FunnelStage;
  observation: string;
  problem: string;
  possibleCause: string;
  evidence: Evidence[];
  hypothesis: string;
  recommendedAction: string;
  /** what the recommended test changes (null = not a creative test, e.g. LP investigation) */
  suggestedVariable: TestVariable | null;
  expectedImpact: string;
  confidence: number;
  priority: number; // 1 = most urgent
}

export interface AiAdAnalysis {
  id: ID;
  organizationId: ID;
  locationId: ID | null;
  campaignId: ID | null;
  periodStart: string;
  periodEnd: string;
  summary: string;
  findings: AdFinding[];
  aiProvider: string | null;
  createdBy: ID | null;
  createdAt: string;
}

export type HypothesisStatus = "proposed" | "accepted" | "rejected" | "in_test" | "validated" | "invalidated";
export type PrimaryMetric = "cpa" | "cvr" | "ctr" | "roas" | "cpc" | "application_cpa";

export interface CreativeHypothesis {
  id: ID;
  organizationId: ID;
  locationId: ID | null;
  analysisId: ID | null;
  campaignId: ID | null;
  adSetId: ID | null;
  adId: ID | null;
  goal: AdGoal;
  problem: string;
  hypothesis: string;
  changeVariable: TestVariable;
  testIdea: string;
  expectedResult: string;
  primaryMetric: PrimaryMetric;
  confidence: number;
  status: HypothesisStatus;
  decidedBy: ID | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface ExperimentCriteria {
  /** challenger must beat control on the primary metric by at least this much (e.g. 0.15 = 15%) */
  minLiftPct: number;
  minSpend: number;
  minImpressions: number;
  minClicks: number;
  minConversions: number;
  minDays: number;
  /** guardrail: stop calling a winner if its frequency is above this */
  maxFrequency: number;
}

export type ExperimentStatus = "draft" | "approved" | "running" | "completed" | "cancelled";
export type ExperimentDecision = "winner" | "inconclusive" | "insufficient_data";
export type VariantDecision = "winner" | "loser" | "inconclusive" | "insufficient_data";

export interface VariantMetrics {
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
}

export interface ExperimentVariant extends VariantMetrics {
  id: ID;
  organizationId: ID;
  experimentId: ID;
  role: "control" | "challenger";
  label: string;
  creativeId: ID | null;
  adId: ID | null;
  providerAdId: string | null;
  variableChanged: string;
  decision: VariantDecision | null;
  metricsUpdatedAt: string | null;
}

export interface Experiment {
  id: ID;
  organizationId: ID;
  locationId: ID | null;
  campaignId: ID | null;
  adSetId: ID | null;
  hypothesisId: ID | null;
  name: string;
  goal: AdGoal;
  variable: TestVariable;
  hypothesis: string;
  primaryMetric: PrimaryMetric;
  secondaryMetrics: string[];
  criteria: ExperimentCriteria;
  controlVariantId: ID | null;
  status: ExperimentStatus;
  decision: ExperimentDecision | null;
  winnerVariantId: ID | null;
  resultSummary: ExperimentResult | null;
  startDate: string | null;
  endDate: string | null;
  approvedBy: ID | null;
  approvedAt: string | null;
  launchedBy: ID | null;
  launchedAt: string | null;
  completedBy: ID | null;
  completedAt: string | null;
  createdBy: ID | null;
  createdAt: string;
  variants: ExperimentVariant[];
}

export interface ExperimentResult {
  decision: ExperimentDecision;
  winnerLabel: string | null;
  reasons: string[];
  liftPct: number | null;
  primaryMetric: PrimaryMetric;
  missing: string[];
  evaluatedAt: string;
}

/** Creative Memory attributes stored on content_learnings (kind='creative'). */
export interface CreativeLearningAttributes {
  persona?: string;
  painPoint?: string;
  hook?: string;
  angle?: string;
  visual?: string;
  cta?: string;
  offer?: string;
  format?: string;
  platform?: string;
  industry?: string;
  goal?: string;
  variable?: string;
  location?: string;
  winningPattern?: string;
  losingPattern?: string;
  why?: string;
  principle?: string;
  [key: string]: string | undefined;
}
