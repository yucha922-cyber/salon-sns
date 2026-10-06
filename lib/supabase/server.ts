import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "@/lib/env";
import type { Database } from "./database.types";

export type ServerSupabaseClient = ReturnType<typeof createServerClient<Database>>;

/**
 * Per-request Supabase client bound to the signed-in user's cookies.
 * All queries run as that user, so Postgres RLS enforces tenant isolation.
 */
export async function createSupabaseServerClient(): Promise<ServerSupabaseClient> {
  const config = getSupabasePublicConfig();
  if (!config) throw new Error("Supabase is not configured");
  const cookieStore = await cookies();
  return createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there.
          // The middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
