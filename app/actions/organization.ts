"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CURRENT_ORG_COOKIE, getOrganizationContext, requireUser } from "@/lib/auth/context";
import { createOrganizationSchema } from "@/lib/domain/schemas";
import { validationError, type ActionResult } from "@/lib/actions";
import { createDemoOrganization } from "@/lib/services/organizations";
import { toUserMessage } from "@/lib/services/errors";

const orgCookie = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 365 };

async function selectOrganization(id: string) {
  (await cookies()).set(CURRENT_ORG_COOKIE, id, orgCookie);
}

export async function createOrganizationAction(input: unknown): Promise<ActionResult<{ organizationId: string }>> {
  const parsed = createOrganizationSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { repo } = await requireUser();
    const org = await repo.createOrganization(parsed.data.name);
    await selectOrganization(org.id);
    return { ok: true, data: { organizationId: org.id } };
  } catch (error) {
    return { ok: false, error: toUserMessage(error) };
  }
}

export async function createDemoOrganizationAction(): Promise<ActionResult<{ organizationId: string }>> {
  try {
    const { repo } = await requireUser();
    const org = await createDemoOrganization(repo);
    await selectOrganization(org.id);
    revalidatePath("/", "layout");
    return { ok: true, data: { organizationId: org.id } };
  } catch (error) {
    return { ok: false, error: toUserMessage(error) };
  }
}

export async function switchOrganizationAction(organizationId: unknown): Promise<ActionResult> {
  const id = z.string().min(1).max(64).safeParse(organizationId);
  if (!id.success) return { ok: false, error: "組織が見つかりません" };
  const { memberships } = await getOrganizationContext();
  // Only organizations the user belongs to can be selected.
  if (!memberships.some((m) => m.organization.id === id.data)) return { ok: false, error: "組織が見つかりません" };
  await selectOrganization(id.data);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function renameOrganizationAction(input: unknown): Promise<ActionResult> {
  const parsed = createOrganizationSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { repo, current } = await getOrganizationContext();
    if (!current) return { ok: false, error: "組織が選択されていません" };
    if (current.role !== "owner" && current.role !== "admin") return { ok: false, error: "この操作を行う権限がありません" };
    await repo.renameOrganization(current.organization.id, parsed.data.name);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toUserMessage(error) };
  }
}
