/**
 * Deterministic posting slots for a month. The number of posts comes from the
 * account's postingFrequency (posts per week), not from "30 days = 30 posts";
 * days/times follow the account's preferred posting days/times. The AI only
 * fills content into these slots, so frequency is always respected.
 */
import type { AccountGoal, SocialPlatform } from "@/lib/domain/types";
import { FUNNELS } from "@/lib/brand/account-goals";

export interface PostingSlot {
  index: number;
  date: string; // YYYY-MM-DD (Japan date)
  time: string; // HH:MM
  weekday: number;
  funnelStage: string;
}

const DEFAULT_TIMES: Record<SocialPlatform, string[]> = {
  instagram: ["20:00", "12:00"],
  threads: ["12:00", "21:00"],
  tiktok: ["19:00"],
  facebook: ["12:00"],
};
// Monday-first spread used when no preferred days are set
const SPREAD_ORDER = [1, 3, 5, 0, 2, 4, 6];

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface SlotOptions {
  year: number;
  month: number; // 1-12
  postsPerWeek: number;
  preferredDays: number[];
  preferredTimes: string[];
  platform: SocialPlatform;
  goal: AccountGoal;
  /** First day that may receive a slot (YYYY-MM-DD), e.g. tomorrow for the current month. */
  earliestDate?: string;
  maxSlots?: number;
}

export function computePostingSlots(o: SlotOptions): PostingSlot[] {
  const daysInMonth = new Date(Date.UTC(o.year, o.month, 0)).getUTCDate();
  const times = o.preferredTimes.length ? o.preferredTimes : DEFAULT_TIMES[o.platform];
  const dayOrder = [...new Set([...o.preferredDays, ...SPREAD_ORDER])];
  const perWeek = Math.max(0, Math.min(50, Math.round(o.postsPerWeek)));

  // Group the month's available days into Sunday-start weeks.
  const weeks: { date: string; weekday: number }[][] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = iso(o.year, o.month, d);
    if (o.earliestDate && date < o.earliestDate) continue;
    const weekday = new Date(Date.UTC(o.year, o.month - 1, d)).getUTCDay();
    if (!weeks.length || weekday === 0) weeks.push([]);
    weeks[weeks.length - 1]!.push({ date, weekday });
  }

  const raw: { date: string; time: string; weekday: number }[] = [];
  for (const week of weeks) {
    // Partial weeks get a proportional share of the weekly frequency.
    const quota = Math.round((perWeek * week.length) / 7);
    const candidates = dayOrder.flatMap((wd) => week.filter((d) => d.weekday === wd));
    // Preferred days first; other days only once preferred ones are used up.
    const preferred = candidates.filter((d) => o.preferredDays.includes(d.weekday));
    const pool = preferred.length >= Math.min(quota, candidates.length) ? preferred : candidates;
    for (let k = 0; k < quota && pool.length; k++) {
      const day = pool[k % pool.length]!;
      const round = Math.floor(k / pool.length);
      raw.push({ date: day.date, weekday: day.weekday, time: times[(k + round) % times.length]! });
    }
  }
  raw.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  // Drop exact duplicates (same day & time) that can happen with >1 post/day.
  const unique = raw.filter((s, i) => i === 0 || s.date + s.time !== raw[i - 1]!.date + raw[i - 1]!.time);
  const limited = unique.slice(0, o.maxSlots ?? 40);

  // Funnel progression across the month (awareness first, conversion last).
  const stages = FUNNELS[o.goal];
  return limited.map((s, index) => ({
    ...s,
    index,
    funnelStage: stages[Math.min(stages.length - 1, Math.floor((index * stages.length) / Math.max(1, limited.length)))]!,
  }));
}

/** "YYYY-MM-DD" + "HH:MM" in Japan time → ISO timestamp. */
export function jstSlotToIso(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, d, hh - 9, mm)).toISOString();
}
