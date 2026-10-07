import "server-only";
import type { ID } from "@/lib/domain/types";
import { getSystemStore } from "@/lib/social/access";
import type { SocialEventInput } from "@/lib/social/types";

/**
 * Audit log for the ad loop (shared social_event_logs table). Who approved /
 * launched / completed is in actorUserId; failures to log never break the
 * action itself.
 */
export async function logAdsEvent(organizationId: ID, input: SocialEventInput): Promise<void> {
  try {
    await getSystemStore()?.logEvent(organizationId, input);
  } catch (error) {
    console.error("[ads] event log failed", error instanceof Error ? error.message : error);
  }
}
