import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/env";
import type { Database } from "./database.types";

export type AnySupabaseClient = SupabaseClient<Database>;

/**
 * Service-role client. Bypasses RLS, so it is ONLY used:
 *   - by the publish / insights worker (no user session), and
 *   - by server actions after lib/social/access.ts verified the user's role
 *     and location scope.
 * Never import this from client components (server-only guards it).
 */
let cached: AnySupabaseClient | null | undefined;

export function getSupabaseAdminClient(): AnySupabaseClient | null {
  if (cached !== undefined) return cached;
  const config = getSupabasePublicConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached = config && key ? createClient<Database>(config.url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return cached;
}
