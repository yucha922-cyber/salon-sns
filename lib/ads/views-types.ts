import type { AdCampaign, AdCreativeRecord, AdFinding, AdGoal, AdMetricSnapshot, AdRecord, AdSetRecord, Experiment, FirstPartyConversion } from "./types";

export type { AdCampaign, AdCreativeRecord, AdFinding, AdGoal, AdRecord, Experiment, FirstPartyConversion };

/** Structural copy of AdsWorkspace (lib/ads/analysis.ts is server-only). */
export interface AdsWorkspaceLike {
  campaigns: AdCampaign[];
  adSets: AdSetRecord[];
  ads: AdRecord[];
  creatives: AdCreativeRecord[];
  snapshots: AdMetricSnapshot[];
  end: string | null;
}
