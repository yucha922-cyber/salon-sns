/**
 * Runtime mode detection. The app runs in one of two data modes:
 *   - "supabase": NEXT_PUBLIC_SUPABASE_URL / ANON_KEY are set → real auth + Postgres (RLS)
 *   - "demo":     not set → in-memory store + signed demo session cookie
 * Demo mode keeps the whole product usable without any credentials
 * (local development, sales demos) and never touches Supabase.
 */
export type DataMode = "supabase" | "demo";

export function getSupabasePublicConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * NEXT_PUBLIC_DEMO_MODE=true forces demo mode (even if Supabase is configured),
 * which is the safe setting for preview deployments. Without the flag, the app
 * uses Supabase when its env vars exist and falls back to demo mode otherwise.
 */
export function isDemoModeForced(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export function getDataMode(): DataMode {
  if (isDemoModeForced()) return "demo";
  return getSupabasePublicConfig() ? "supabase" : "demo";
}

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
