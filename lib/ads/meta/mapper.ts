/**
 * Meta Insights → common daily metrics (pure).
 *   clicks = inline_link_clicks (link clicks, the CTR/CPC basis used everywhere)
 *   landing page views = actions[landing_page_view]
 *   3-second video views = actions[video_view]; ThruPlay = video_thruplay_watched_actions
 *   conversions = the FIRST matching action type of the campaign's CV event
 *     (e.g. Schedule → schedule_total, schedule_website, offsite_conversion.fb_pixel_schedule)
 *     so the same event is never double counted.
 * Deprecated windows (7d_view / 28d_view) are never requested; the ad set's
 * own attribution setting applies (Insights follows it since 2025-06).
 */
import type { AdDailyMetrics } from "../types";

export interface ActionValue {
  action_type: string;
  value: string;
}

export interface MetaInsightRow {
  date_start: string;
  date_stop: string;
  account_id?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  inline_link_clicks?: string;
  actions?: ActionValue[];
  action_values?: ActionValue[];
  video_thruplay_watched_actions?: ActionValue[];
}

export const CONVERSION_ACTION_TYPES: Record<string, string[]> = {
  Schedule: ["schedule_total", "schedule_website", "offsite_conversion.fb_pixel_schedule", "schedule"],
  Lead: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"],
  SubmitApplication: ["submit_application_total", "submit_application_website", "offsite_conversion.fb_pixel_submit_application", "submit_application"],
  Contact: ["contact_total", "contact_website", "offsite_conversion.fb_pixel_contact", "contact"],
  Purchase: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
  CompleteRegistration: ["complete_registration", "offsite_conversion.fb_pixel_complete_registration"],
};

export function actionTypesFor(event: string | null | undefined): string[] {
  if (!event) return CONVERSION_ACTION_TYPES.Schedule as string[];
  if (event.startsWith("custom:")) return [`offsite_conversion.custom.${event.slice(7)}`];
  return CONVERSION_ACTION_TYPES[event] ?? [event];
}

const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));

export function pickAction(list: ActionValue[] | undefined, types: string[]): number | null {
  if (!list?.length) return null;
  for (const t of types) {
    const hit = list.find((a) => a.action_type === t);
    if (hit) return Number(hit.value);
  }
  return null;
}

export function mapInsightRow(r: MetaInsightRow, conversionTypes: string[]): { metrics: AdDailyMetrics; raw: Record<string, number> } {
  const raw: Record<string, number> = {};
  for (const a of r.actions ?? []) raw[a.action_type] = Number(a.value);
  for (const a of r.action_values ?? []) raw[`value:${a.action_type}`] = Number(a.value);
  return {
    metrics: {
      spend: num(r.spend) ?? 0,
      impressions: num(r.impressions) ?? 0,
      reach: num(r.reach),
      frequency: num(r.frequency),
      clicks: num(r.inline_link_clicks) ?? 0,
      landingPageViews: pickAction(r.actions, ["landing_page_view", "omni_landing_page_view"]),
      conversions: pickAction(r.actions, conversionTypes) ?? 0,
      revenue: pickAction(r.action_values, conversionTypes),
      video3sViews: pickAction(r.actions, ["video_view"]),
      thruplays: pickAction(r.video_thruplay_watched_actions, ["video_view"]) ?? (r.video_thruplay_watched_actions?.[0] ? Number(r.video_thruplay_watched_actions[0].value) : null),
    },
    raw,
  };
}
