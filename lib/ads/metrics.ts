/**
 * Ad metrics model (pure). Daily provider rows → derived ratios, windows and
 * period comparisons (前日比 / 7日 / 14日 / 30日).
 *
 * Definitions (consistent everywhere):
 *   CTR  = link clicks / impressions
 *   CPC  = spend / link clicks
 *   CPM  = spend / impressions × 1000
 *   CVR  = conversions / link clicks            (click → conversion)
 *   LP CVR = conversions / landing page views   (LP → conversion)
 *   CPA  = spend / conversions
 *   ROAS = revenue / spend
 * Frequency over a window = impression-weighted average of daily frequency
 * (reach is not additive across days; documented in the README).
 */
import type { AdDailyMetrics, AdMetricSnapshot } from "./types";

export interface Aggregate {
  days: number;
  spend: number;
  impressions: number;
  clicks: number;
  landingPageViews: number | null;
  conversions: number;
  revenue: number | null;
  video3sViews: number | null;
  thruplays: number | null;
  frequency: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cvr: number | null;
  lpCvr: number | null;
  lpvRate: number | null;
  cpa: number | null;
  roas: number | null;
  hookRate: number | null; // 3s video views / impressions
}

const div = (a: number | null, b: number | null): number | null => (a === null || b === null || b === 0 ? null : a / b);

export function derive(m: AdDailyMetrics): Pick<AdMetricSnapshot, "ctr" | "cpc" | "cpm" | "cvr" | "cpa" | "roas"> {
  return {
    ctr: div(m.clicks, m.impressions),
    cpc: div(m.spend, m.clicks),
    cpm: m.impressions ? (m.spend / m.impressions) * 1000 : null,
    cvr: div(m.conversions, m.clicks),
    cpa: div(m.spend, m.conversions),
    roas: m.revenue === null ? null : div(m.revenue, m.spend),
  };
}

const sumNullable = (rows: AdDailyMetrics[], key: keyof AdDailyMetrics): number | null => {
  const values = rows.map((r) => r[key]).filter((v): v is number => typeof v === "number");
  return values.length ? values.reduce((a, b) => a + b, 0) : null;
};

export function aggregate(rows: AdDailyMetrics[]): Aggregate {
  const spend = rows.reduce((n, r) => n + r.spend, 0);
  const impressions = rows.reduce((n, r) => n + r.impressions, 0);
  const clicks = rows.reduce((n, r) => n + r.clicks, 0);
  const conversions = rows.reduce((n, r) => n + r.conversions, 0);
  const landingPageViews = sumNullable(rows, "landingPageViews");
  const revenue = sumNullable(rows, "revenue");
  const video3sViews = sumNullable(rows, "video3sViews");
  const freqRows = rows.filter((r) => typeof r.frequency === "number" && r.impressions > 0);
  const freqImpr = freqRows.reduce((n, r) => n + r.impressions, 0);
  return {
    days: rows.length,
    spend,
    impressions,
    clicks,
    landingPageViews,
    conversions,
    revenue,
    video3sViews,
    thruplays: sumNullable(rows, "thruplays"),
    frequency: freqImpr ? freqRows.reduce((n, r) => n + (r.frequency as number) * r.impressions, 0) / freqImpr : null,
    ctr: div(clicks, impressions),
    cpc: div(spend, clicks),
    cpm: impressions ? (spend / impressions) * 1000 : null,
    cvr: div(conversions, clicks),
    lpCvr: div(conversions, landingPageViews),
    lpvRate: div(landingPageViews, clicks),
    cpa: div(spend, conversions),
    roas: revenue === null ? null : div(revenue, spend),
    hookRate: div(video3sViews, impressions),
  };
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Rows with date in (end - days, end]. */
export function windowRows<T extends { date: string }>(rows: T[], end: string, days: number): T[] {
  const start = addDays(end, -days + 1);
  return rows.filter((r) => r.date >= start && r.date <= end);
}

export interface WindowSet {
  end: string;
  yesterday: Aggregate;
  dayBefore: Aggregate;
  last7: Aggregate;
  prev7: Aggregate;
  last14: Aggregate;
  last30: Aggregate;
  last3: Aggregate;
}

export function windows(rows: AdMetricSnapshot[], end: string): WindowSet {
  return {
    end,
    yesterday: aggregate(windowRows(rows, end, 1)),
    dayBefore: aggregate(windowRows(rows, addDays(end, -1), 1)),
    last3: aggregate(windowRows(rows, end, 3)),
    last7: aggregate(windowRows(rows, end, 7)),
    prev7: aggregate(windowRows(rows, addDays(end, -7), 7)),
    last14: aggregate(windowRows(rows, end, 14)),
    last30: aggregate(windowRows(rows, end, 30)),
  };
}

/** (current − base) / base; null when not comparable. */
export function change(current: number | null, base: number | null): number | null {
  if (current === null || base === null || base === 0) return null;
  return (current - base) / base;
}

export const LOWER_IS_BETTER = new Set(["cpa", "cpc", "cpm", "application_cpa", "frequency"]);

export function fmtYen(n: number | null, currency = "JPY"): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export function fmtPct(n: number | null, digits = 2): string {
  return n === null || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(digits)}%`;
}

export function fmtChange(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const p = Math.round(n * 100);
  return `${p > 0 ? "+" : ""}${p}%`;
}

export function fmtNum(n: number | null, digits = 0): string {
  return n === null || !Number.isFinite(n) ? "—" : new Intl.NumberFormat("ja-JP", { maximumFractionDigits: digits }).format(n);
}
