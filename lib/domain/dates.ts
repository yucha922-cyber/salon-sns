/** All calendar math uses Japan time so server and client render the same days. */
export const APP_TIME_ZONE = "Asia/Tokyo";

export function jstDateKey(date: Date): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function jstTime(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "YYYY-MM" → {year, month(1-12)}; falls back to the current JST month. */
export function parseMonth(value: string | undefined, now: Date = new Date()): { year: number; month: number } {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
  }
  const [y, m] = jstDateKey(now).split("-");
  return { year: Number(y), month: Number(m) };
}

export function shiftMonth({ year, month }: { year: number; month: number }, delta: number): string {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 6x7 grid of YYYY-MM-DD keys for a month view (weeks start on Sunday). */
export function monthGrid({ year, month }: { year: number; month: number }): { key: string; day: number; inMonth: boolean }[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return {
      key: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month - 1,
    };
  });
}
