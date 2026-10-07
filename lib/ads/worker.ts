import "server-only";
import type { ID } from "@/lib/domain/types";
import { getSystemAdsStore } from "./access";
import { refreshExperiment } from "./experiment-service";
import { getAdsProvider } from "./registry";
import { syncAdAccount } from "./sync";

export interface AdsTickResult {
  ok: boolean;
  accounts: number;
  synced: number;
  failed: number;
  experimentsRefreshed: number;
  skipped?: string;
}

/**
 * Scheduled job (daily is enough; Meta finalizes a day's numbers over the
 * following days, so every run re-pulls the last 28 days).
 *   1. sync every connected ad account (read only)
 *   2. refresh running experiments (metrics + provisional evaluation)
 * It NEVER pauses, activates, creates ads or changes budgets: those are
 * human actions in the UI.
 */
export async function runAdsTick(options: { organizationId?: ID; now?: Date } = {}): Promise<AdsTickResult> {
  const store = getSystemAdsStore();
  if (!store) return { ok: false, accounts: 0, synced: 0, failed: 0, experimentsRefreshed: 0, skipped: "SUPABASE_SERVICE_ROLE_KEY is not configured" };
  const accounts = (await store.systemListAdAccounts()).filter((a) => !options.organizationId || a.organizationId === options.organizationId);
  let synced = 0;
  let failed = 0;
  let experimentsRefreshed = 0;
  const orgs = new Set<ID>();
  for (const account of accounts) {
    orgs.add(account.organizationId);
    try {
      const isDemo = await store.getOrganizationIsDemo(account.organizationId);
      await syncAdAccount(store, getAdsProvider({ isDemoOrganization: isDemo, account }), account, { now: options.now });
      synced++;
    } catch (error) {
      failed++;
      console.error("[ads] sync failed", account.id, error instanceof Error ? error.message : error);
    }
  }
  for (const org of orgs) {
    for (const e of (await store.listExperiments(org)).filter((x) => x.status === "running")) {
      await refreshExperiment(store, org, e.id, options.now);
      experimentsRefreshed++;
    }
  }
  return { ok: failed === 0, accounts: accounts.length, synced, failed, experimentsRefreshed };
}
