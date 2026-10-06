import "server-only";
import type { AppContext } from "@/lib/auth/context";
import type { ID, SocialPlatform } from "@/lib/domain/types";
import { canAccessLocation, getSocialContext } from "./access";
import type { ContentLearning } from "./types";

/**
 * Loads the Marketing Memory relevant to a planning / creation request:
 * same account > same location > same platform > organization-wide.
 * Never throws: generation must work even if the memory store is unavailable.
 */
export async function loadMarketingMemory(
  app: AppContext,
  filter: { accountId?: ID | null; locationId?: ID | null; platform?: SocialPlatform | null } = {},
  limit = 8,
): Promise<ContentLearning[]> {
  try {
    const ctx = await getSocialContext(app);
    const learnings = (await ctx.reader.listLearnings(ctx.organizationId, { status: "active" })).filter((l) => canAccessLocation(ctx, l.locationId) || l.locationId === null);
    return rankLearnings(learnings, filter).slice(0, limit);
  } catch (error) {
    console.error("[memory] load failed", error instanceof Error ? error.message : error);
    return [];
  }
}

export function rankLearnings(learnings: ContentLearning[], filter: { accountId?: ID | null; locationId?: ID | null; platform?: SocialPlatform | null }): ContentLearning[] {
  const today = new Date().toISOString().slice(0, 10);
  const score = (l: ContentLearning) =>
    (filter.accountId && l.socialAccountId === filter.accountId ? 3 : 0) +
    (filter.locationId && l.locationId === filter.locationId ? 2 : 0) +
    (filter.platform && l.platform === filter.platform ? 1 : 0) +
    l.confidence;
  return learnings
    .filter((l) => !l.validUntil || l.validUntil >= today)
    .filter((l) => !filter.accountId || !l.socialAccountId || l.socialAccountId === filter.accountId || l.locationId === (filter.locationId ?? null) || score(l) >= 1.5)
    .sort((a, b) => score(b) - score(a) || b.createdAt.localeCompare(a.createdAt));
}
