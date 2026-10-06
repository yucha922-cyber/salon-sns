import "server-only";
import type { DataRepository } from "@/lib/data/repository";
import type { BrandBrain, ContentType, HqCampaign, LocationProfile, Post, SnsAccount } from "@/lib/domain/types";
import { ACCOUNT_GOAL_LABELS } from "@/lib/domain/labels";
import { getAIProvider } from "@/lib/ai";
import { buildPostCreatorRequest } from "@/lib/ai/prompts/post-creator";

const MAX_LOCATIONS_PER_RUN = 20;

const DEFAULT_CONTENT: Record<SnsAccount["platform"], ContentType> = {
  instagram: "feed",
  threads: "threads_text",
  tiktok: "short_video",
  facebook: "feed",
};

/** The account a location's localized post should go to (acquisition first). */
export function pickAccountForLocation(accounts: SnsAccount[], locationId: string): SnsAccount | null {
  const local = accounts.filter((a) => a.active && a.locationId === locationId);
  return (
    local.find((a) => a.goal === "acquisition") ??
    local.find((a) => a.goal !== "recruitment") ??
    accounts.find((a) => a.active && a.locationId === null && a.goal !== "recruitment") ??
    null
  );
}

/**
 * Accounts that should receive the campaign at a location: active, on a target
 * platform, and matching the campaign goal (recruitment campaigns only go to
 * recruitment accounts and vice versa). Falls back to the best single account.
 */
export function accountsForCampaign(accounts: SnsAccount[], locationId: string, campaign: HqCampaign): SnsAccount[] {
  const platformOk = (a: SnsAccount) => campaign.targetPlatforms.length === 0 || campaign.targetPlatforms.includes(a.platform);
  const goalOk = (a: SnsAccount) => (campaign.goal === "recruitment" ? a.goal === "recruitment" : a.goal !== "recruitment");
  const matches = accounts.filter((a) => a.active && a.locationId === locationId && platformOk(a) && goalOk(a));
  if (matches.length) return matches;
  const fallback = pickAccountForLocation(accounts.filter(platformOk), locationId);
  return fallback && goalOk(fallback) ? [fallback] : [];
}

/** "YYYY-MM-DD" → that day 20:00 JST as ISO. */
function campaignSlot(date: string | null): string | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 20 - 9)).toISOString();
}

export interface LocalizationResult {
  created: { post: Post; locationName: string; accountHandle: string | null }[];
  skipped: { locationName: string; reason: string }[];
}

/**
 * HQ → locations: generates one localized draft per target location, applying
 * the location customization, the location account's strategy and the HQ
 * localization rules. Drafts are saved for human review (never auto-published).
 */
export async function localizeCampaign(
  repo: DataRepository,
  organizationId: string,
  brain: BrandBrain,
  campaign: HqCampaign,
  onlyLocationIds?: string[],
): Promise<LocalizationResult> {
  const [locations, accounts] = await Promise.all([repo.listLocationProfiles(organizationId), repo.listAccounts(organizationId)]);
  const targets = locations.filter(
    (l) =>
      (campaign.targetLocationIds.length === 0 || campaign.targetLocationIds.includes(l.locationId)) &&
      (!onlyLocationIds || onlyLocationIds.includes(l.locationId)),
  );
  const provider = getAIProvider();
  const result: LocalizationResult = { created: [], skipped: [] };

  for (const location of targets.slice(0, MAX_LOCATIONS_PER_RUN)) {
    const targetsAtLocation: (SnsAccount | null)[] = accountsForCampaign(accounts, location.locationId, campaign);
    if (!targetsAtLocation.length) {
      if (campaign.targetPlatforms.length) {
        result.skipped.push({ locationName: location.locationName, reason: "対象SNSのアカウントがありません" });
        continue;
      }
      targetsAtLocation.push(null);
    }
    for (const account of targetsAtLocation) {
      const platform = account?.platform ?? "instagram";
      try {
        const { object } = await provider.generateStructuredObject(
          buildPostCreatorRequest(
            brain,
            {
              platform,
              contentType: DEFAULT_CONTENT[platform],
              theme: campaign.sharedTheme,
              target: account?.strategy.targetAudience || location.demographics,
              goal: account ? ACCOUNT_GOAL_LABELS[account.goal] : "集客",
              tone: account?.strategy.tone ?? "",
              notes: [campaign.creative.headline, campaign.creative.body].filter(Boolean).join(" / ").slice(0, 500),
            },
            { account, location, campaign },
          ),
        );
        const post = await repo.createPost(organizationId, {
          platform,
          contentType: DEFAULT_CONTENT[platform],
          title: object.title,
          caption: object.caption,
          cta: object.cta,
          hashtags: object.hashtags,
          status: "draft",
          scheduledAt: campaignSlot(campaign.startsOn),
          source: "hq_localization",
          aiProvider: provider.name,
          accountId: account?.id ?? null,
          locationId: location.locationId,
          hqCampaignId: campaign.id,
          planning: { theme: campaign.sharedTheme.slice(0, 200), goal: account?.goal ?? campaign.goal },
        });
        result.created.push({ post, locationName: location.locationName, accountHandle: account?.handle ?? null });
      } catch (error) {
        console.error(error);
        result.skipped.push({ locationName: location.locationName, reason: "生成に失敗しました" });
      }
    }
  }
  for (const location of targets.slice(MAX_LOCATIONS_PER_RUN)) {
    result.skipped.push({ locationName: location.locationName, reason: `一度に生成できるのは${MAX_LOCATIONS_PER_RUN}店舗までです` });
  }
  return result;
}

export function findLocation(locations: LocationProfile[], id: string | null | undefined): LocationProfile | null {
  return (id && locations.find((l) => l.locationId === id)) || null;
}
