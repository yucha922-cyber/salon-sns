"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOrganizationContext } from "@/lib/auth/context";
import { brandBrainInputSchema } from "@/lib/domain/schemas";
import type { BrandBrain } from "@/lib/domain/types";
import { validationError, type ActionResult } from "@/lib/actions";
import { toUserMessage } from "@/lib/services/errors";

const optionsSchema = z.object({
  onboardingStep: z.number().int().min(0).max(6).optional(),
  completeOnboarding: z.boolean().optional(),
});

/** Saves the Brand Brain of the user's *current* organization (never an arbitrary id). */
export async function saveBrandBrainAction(input: unknown, options: unknown = {}): Promise<ActionResult<BrandBrain>> {
  const parsed = brandBrainInputSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const opts = optionsSchema.safeParse(options);
  if (!opts.success) return validationError(opts.error);
  try {
    const { repo, current } = await getOrganizationContext();
    if (!current) return { ok: false, error: "組織が選択されていません" };
    if (current.role === "viewer") return { ok: false, error: "閲覧権限のため保存できません" };
    const saved = await repo.saveBrandBrain(current.organization.id, parsed.data, opts.data);
    revalidatePath("/", "layout");
    return { ok: true, data: saved };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "Brand Brainの保存に失敗しました") };
  }
}
