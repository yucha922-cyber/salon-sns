"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppContext } from "@/lib/auth/context";
import { hqCampaignInputSchema, locationProfileInputSchema, snsAccountInputSchema } from "@/lib/domain/schemas";
import { type HqCampaign, type LocationProfile, type SnsAccount } from "@/lib/domain/types";
import { validationError, type ActionResult } from "@/lib/actions";
import { toUserMessage } from "@/lib/services/errors";
import { RepositoryError } from "@/lib/data/repository";
import { getAIProvider } from "@/lib/ai";
import { buildAccountStrategistRequest } from "@/lib/ai/prompts/account-strategy";
import type { AccountStrategistOutput } from "@/lib/ai/schemas";
import { contentPillarInputSchema } from "@/lib/domain/schemas";
import type { ContentPillar } from "@/lib/domain/types";
import { findLocation, localizeCampaign, type LocalizationResult } from "@/lib/services/localization";

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

async function editableContext() {
  const ctx = await requireAppContext();
  if (ctx.current.role === "viewer") throw new RepositoryError("read-only member", "forbidden");
  return ctx;
}

function refresh(...paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function saveAccountAction(id: unknown, input: unknown): Promise<ActionResult<SnsAccount>> {
  const parsedId = idSchema.nullable().safeParse(id);
  const parsed = snsAccountInputSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  if (!parsedId.success) return { ok: false, error: "アカウントが見つかりません" };
  try {
    const { repo, current } = await editableContext();
    const account = await repo.saveAccount(current.organization.id, parsedId.data, parsed.data);
    refresh("/accounts", "/brand", "/creator");
    return { ok: true, data: account };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "アカウントの保存に失敗しました") };
  }
}

export async function deleteAccountAction(id: unknown): Promise<ActionResult> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "アカウントが見つかりません" };
  try {
    const { repo, current } = await editableContext();
    await repo.deleteAccount(current.organization.id, parsedId.data);
    refresh("/accounts", "/brand");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "アカウントの削除に失敗しました") };
  }
}

/** AI Account Strategist: returns a proposal; the user applies it explicitly. */
export async function runAccountStrategistAction(input: unknown): Promise<ActionResult<AccountStrategistOutput>> {
  const parsed = snsAccountInputSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { repo, current, brain } = await requireAppContext();
    const orgId = current.organization.id;
    const [locations, pillars] = await Promise.all([repo.listLocationProfiles(orgId), repo.listContentPillars(orgId)]);
    const location = findLocation(locations, parsed.data.locationId);
    const { object } = await getAIProvider().generateStructuredObject(buildAccountStrategistRequest(brain, parsed.data, location, pillars));
    return { ok: true, data: object };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "戦略の提案に失敗しました") };
  }
}

export async function createContentPillarAction(input: unknown): Promise<ActionResult<ContentPillar>> {
  const parsed = contentPillarInputSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { repo, current } = await editableContext();
    const pillar = await repo.createContentPillar(current.organization.id, parsed.data);
    refresh("/accounts");
    return { ok: true, data: pillar };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "コンテンツの柱の追加に失敗しました") };
  }
}

// ---------------------------------------------------------------------------
// Location customization
// ---------------------------------------------------------------------------

export async function saveLocationProfileAction(locationId: unknown, input: unknown): Promise<ActionResult<LocationProfile>> {
  const parsedId = idSchema.safeParse(locationId);
  const parsed = locationProfileInputSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  if (!parsedId.success) return { ok: false, error: "店舗が見つかりません" };
  try {
    const { repo, current } = await editableContext();
    const profile = await repo.saveLocationProfile(current.organization.id, parsedId.data, parsed.data);
    refresh("/locations", "/hq");
    return { ok: true, data: profile };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "店舗情報の保存に失敗しました") };
  }
}

// ---------------------------------------------------------------------------
// HQ templates
// ---------------------------------------------------------------------------

export async function saveHqCampaignAction(id: unknown, input: unknown): Promise<ActionResult<HqCampaign>> {
  const parsedId = idSchema.nullable().safeParse(id);
  const parsed = hqCampaignInputSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  if (!parsedId.success) return { ok: false, error: "キャンペーンが見つかりません" };
  try {
    const { repo, current } = await editableContext();
    const campaign = await repo.saveHqCampaign(current.organization.id, parsedId.data, parsed.data);
    refresh("/hq");
    return { ok: true, data: campaign };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "キャンペーンの保存に失敗しました") };
  }
}

export async function deleteHqCampaignAction(id: unknown): Promise<ActionResult> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "キャンペーンが見つかりません" };
  try {
    const { repo, current } = await editableContext();
    await repo.deleteHqCampaign(current.organization.id, parsedId.data);
    refresh("/hq");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "キャンペーンの削除に失敗しました") };
  }
}

/** Generates localized drafts for every (or the selected) target location. */
export async function localizeHqCampaignAction(id: unknown, locationIds?: unknown): Promise<ActionResult<LocalizationResult>> {
  const parsedId = idSchema.safeParse(id);
  const parsedLocations = z.array(idSchema).max(200).optional().safeParse(locationIds);
  if (!parsedId.success || !parsedLocations.success) return { ok: false, error: "キャンペーンが見つかりません" };
  try {
    const { repo, current, brain } = await editableContext();
    const campaign = (await repo.listHqCampaigns(current.organization.id)).find((c) => c.id === parsedId.data);
    if (!campaign) return { ok: false, error: "キャンペーンが見つかりません" };
    const result = await localizeCampaign(repo, current.organization.id, brain, campaign, parsedLocations.data);
    if (!result.created.length && !result.skipped.length) {
      return { ok: false, error: "対象の店舗がありません。Brand Brainで店舗を登録してください" };
    }
    refresh("/planner", "/posts", "/dashboard", "/hq");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "ローカライズに失敗しました") };
  }
}
