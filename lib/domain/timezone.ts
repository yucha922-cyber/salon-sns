/**
 * Timezone strategy: the DB stores timestamptz (UTC instants). Users enter and
 * read times in the location's timezone (fallback: organization, then
 * Asia/Tokyo). These helpers convert between a wall-clock string and an ISO
 * instant for any IANA timezone (pure, client-safe).
 */
export const DEFAULT_TIMEZONE = "Asia/Tokyo";

function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** "2026-10-07T20:00" in `timeZone` → ISO UTC string. Returns null for invalid input. */
export function zonedLocalToIso(local: string, timeZone: string = DEFAULT_TIMEZONE): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes handle DST transitions correctly.
  let instant = guess - offsetMinutes(new Date(guess), timeZone) * 60_000;
  instant = guess - offsetMinutes(new Date(instant), timeZone) * 60_000;
  const date = new Date(instant);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** ISO instant → "YYYY-MM-DDTHH:mm" wall clock in `timeZone` (for datetime-local inputs). */
export function isoToZonedLocal(iso: string | null, timeZone: string = DEFAULT_TIMEZONE): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() + offsetMinutes(date, timeZone) * 60_000);
  return local.toISOString().slice(0, 16);
}

export function formatInZone(iso: string | null, timeZone: string = DEFAULT_TIMEZONE, withWeekday = true): string {
  if (!iso) return "未設定";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone,
    month: "numeric",
    day: "numeric",
    weekday: withWeekday ? "short" : undefined,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
