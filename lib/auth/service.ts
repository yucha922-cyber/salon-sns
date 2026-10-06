import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { AppUser } from "@/lib/domain/types";
import { getDataMode, getSiteUrl } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDemoStore, newId, persistDemoStore } from "@/lib/data/demo-store";
import { DemoRepository } from "@/lib/data/demo-repository";
import { SupabaseRepository } from "@/lib/data/supabase-repository";
import type { DataRepository } from "@/lib/data/repository";
import { createDemoOrganization } from "@/lib/services/organizations";
import { DEMO_ACCOUNT } from "@/lib/demo/seed";
import {
  decodeDemoSession,
  DEMO_SESSION_COOKIE,
  demoSessionCookieOptions,
  encodeDemoSession,
  hashPassword,
  verifyPassword,
} from "./demo-session";

/**
 * Authentication facade. UI and server actions call these functions and
 * never touch Supabase Auth or the demo session directly.
 */

export type AuthResult =
  | { ok: true; needsEmailConfirmation?: boolean }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Demo mode helpers
// ---------------------------------------------------------------------------

let demoSeedPromise: Promise<void> | null = null;

/** Seeds the shared demo account (demo@naoru.jp) with the NAORU demo org once. */
function ensureDemoAccount(): Promise<void> {
  demoSeedPromise ??= (async () => {
    const store = getDemoStore();
    if (store.users.some((u) => u.email === DEMO_ACCOUNT.email)) return;
    const id = newId();
    store.users.push({
      id,
      email: DEMO_ACCOUNT.email,
      displayName: DEMO_ACCOUNT.displayName,
      passwordHash: hashPassword(DEMO_ACCOUNT.password),
    });
    persistDemoStore();
    await createDemoOrganization(new DemoRepository(id));
  })();
  return demoSeedPromise;
}

async function setDemoSession(userId: string): Promise<void> {
  (await cookies()).set(DEMO_SESSION_COOKIE, encodeDemoSession(userId), demoSessionCookieOptions);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  if (getDataMode() === "supabase") {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const meta: unknown = user.user_metadata;
    const displayName =
      typeof meta === "object" && meta !== null && "display_name" in meta && typeof meta.display_name === "string"
        ? meta.display_name
        : (user.email?.split("@")[0] ?? "");
    return { id: user.id, email: user.email ?? "", displayName };
  }
  await ensureDemoAccount();
  const userId = decodeDemoSession((await cookies()).get(DEMO_SESSION_COOKIE)?.value);
  const record = userId ? getDemoStore().users.find((u) => u.id === userId) : undefined;
  return record ? { id: record.id, email: record.email, displayName: record.displayName } : null;
});

export async function signUp(input: { email: string; password: string; displayName: string }): Promise<AuthResult> {
  if (getDataMode() === "supabase") {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { display_name: input.displayName },
        emailRedirectTo: `${getSiteUrl()}/auth/callback`,
      },
    });
    if (error) return { ok: false, error: translateAuthError(error.message) };
    return { ok: true, needsEmailConfirmation: !data.session };
  }
  await ensureDemoAccount();
  const store = getDemoStore();
  if (store.users.some((u) => u.email === input.email)) {
    return { ok: false, error: "このメールアドレスはすでに登録されています" };
  }
  const id = newId();
  store.users.push({ id, email: input.email, displayName: input.displayName, passwordHash: hashPassword(input.password) });
  persistDemoStore();
  await setDemoSession(id);
  return { ok: true };
}

export async function signIn(input: { email: string; password: string }): Promise<AuthResult> {
  if (getDataMode() === "supabase") {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword(input);
    return error ? { ok: false, error: translateAuthError(error.message) } : { ok: true };
  }
  await ensureDemoAccount();
  const record = getDemoStore().users.find((u) => u.email === input.email);
  if (!record || !verifyPassword(input.password, record.passwordHash)) {
    return { ok: false, error: "メールアドレスまたはパスワードが正しくありません" };
  }
  await setDemoSession(record.id);
  return { ok: true };
}

export async function signOut(): Promise<void> {
  if (getDataMode() === "supabase") {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  const store = await cookies();
  store.delete(DEMO_SESSION_COOKIE);
}

/** Repository bound to the signed-in user. */
export async function getRepository(user: AppUser): Promise<DataRepository> {
  if (getDataMode() === "supabase") {
    return new SupabaseRepository(await createSupabaseServerClient(), user.id);
  }
  return new DemoRepository(user.id);
}

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "メールアドレスまたはパスワードが正しくありません";
  if (m.includes("already registered") || m.includes("already exists")) return "このメールアドレスはすでに登録されています";
  if (m.includes("email not confirmed")) return "メールアドレスの確認が完了していません。届いたメールのリンクを開いてください";
  if (m.includes("password")) return "パスワードの条件を満たしていません（8文字以上）";
  if (m.includes("rate limit")) return "試行回数が多すぎます。しばらくしてからお試しください";
  return "認証に失敗しました。時間をおいて再度お試しください";
}
