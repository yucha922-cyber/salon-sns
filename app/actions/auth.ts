"use server";

import { redirect } from "next/navigation";
import { authCredentialsSchema, signUpSchema } from "@/lib/domain/schemas";
import { signIn, signOut, signUp } from "@/lib/auth/service";
import { validationError, type ActionResult } from "@/lib/actions";
import { DEMO_ACCOUNT } from "@/lib/demo/seed";
import { getDataMode } from "@/lib/env";

export async function signUpAction(input: unknown): Promise<ActionResult<{ needsEmailConfirmation: boolean }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await signUp(parsed.data);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: { needsEmailConfirmation: Boolean(result.needsEmailConfirmation) } };
}

export async function signInAction(input: unknown): Promise<ActionResult> {
  const parsed = authCredentialsSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await signIn(parsed.data);
  return result.ok ? { ok: true, data: undefined } : { ok: false, error: result.error };
}

/** One-click login to the shared demo account (demo mode only). */
export async function signInAsDemoAction(): Promise<ActionResult> {
  if (getDataMode() !== "demo") return { ok: false, error: "デモアカウントはDemoモードでのみ利用できます" };
  const result = await signIn({ email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password });
  return result.ok ? { ok: true, data: undefined } : { ok: false, error: result.error };
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/login");
}
