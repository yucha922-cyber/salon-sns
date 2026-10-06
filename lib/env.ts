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

export function getDataMode(): DataMode {
  return getSupabasePublicConfig() ? "supabase" : "demo";
}

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
