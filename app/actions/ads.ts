"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppContext } from "@/lib/auth/context";
import { validationError, type ActionResult } from "@/lib/actions";
import type { ID } from "@/lib/domain/types";
import { toUserMessage } from "@/lib/services/errors";
import { SocialApiError } from "@/lib/social/errors";
import { checkRateLimit, rateLimitMessage } from "@/lib/social/rate-limit";
import {
  analyzeAds,
  createExperiment,
  generateDrafts,
  recordConversions,
  rejectHypothesis,
  reviewDraft,
  runExperimentCommand,
  updateCampaignSettings,
  type ExperimentCommand,
} from "@/lib/ads/app";
import { ADS_PENDING_COOKIE, adsCookieOptions, completeAdsConnection, disconnectAdAccount, syncNow } from "@/lib/ads/connect";
import { AdsStoreError } from "@/lib/ads/store";
import { CONVERSION_KINDS } from "@/lib/ads/types";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "IDが不正です");

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof AdsStoreError && error.code !== "unknown") return error.message;
  if (error instanceof SocialApiError) return error.userMessage;
  return toUserMessage(error, fallback);
}

function refresh() {
  for (const p of ["/ads", "/ads/creatives", "/ads/experiments", "/ads/connect", "/ads/conversions", "/analysis", "/studio", "/memory"]) revalidatePath(p);
}

async function run<T>(fallback: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (!(error instanceof AdsStoreError) && !(error instanceof SocialApiError)) console.error("[ads action]", error instanceof Error ? error.message : error);
    return { ok: false, error: errorMessage(error, fallback) };
  }
}

export async function runAdAnalysisAction(): Promise<ActionResult<{ findings: number; hypotheses: number; recommendations: number }>> {
  const app = await requireAppContext();
  const rl = checkRateLimit(`ads-analyze:${app.user.id}`, 10, 60 * 60_000);
  if (!rl.ok) return { ok: false, error: rateLimitMessage(rl.retryAfterSeconds) };
  return run("AI分析に失敗しました", async () => {
    const r = await analyzeAds(app);
    return { findings: r.analysis?.findings.length ?? 0, hypotheses: r.hypotheses.length, recommendations: r.recommendations };
  });
}

export async function syncAdAccountAction(adAccountId: ID): Promise<ActionResult<{ snapshots: number; until: string }>> {
  const parsed = id.safeParse(adAccountId);
  if (!parsed.success) return validationError(parsed.error);
  const app = await requireAppContext();
  const rl = checkRateLimit(`ads-sync:${app.user.id}`, 6, 60 * 60_000);
  if (!rl.ok) return { ok: false, error: rateLimitMessage(rl.retryAfterSeconds) };
  return run("同期に失敗しました", async () => {
    const r = await syncNow(app, parsed.data);
    return { snapshots: r.snapshots, until: r.until };
  });
}

export async function generateCreativeDraftsAction(hypothesisId: ID, regenerate = false): Promise<ActionResult<{ count: number }>> {
  const parsed = id.safeParse(hypothesisId);
  if (!parsed.success) return validationError(parsed.error);
  const app = await requireAppContext();
  const rl = checkRateLimit(`ads-generate:${app.user.id}`, 20, 60 * 60_000);
  if (!rl.ok) return { ok: false, error: rateLimitMessage(rl.retryAfterSeconds) };
  return run("Creative案の生成に失敗しました", async () => ({ count: (await generateDrafts(app, parsed.data, regenerate)).drafts.length }));
}

const reviewSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().max(300).default("") }),
  z.object({
    action: z.literal("edit"),
    patch: z.object({
      headline: z.string().trim().min(1, "見出しを入力してください").max(80),
      primaryText: z.string().trim().min(1, "本文を入力してください").max(500),
      hook: z.string().trim().min(1).max(80),
      firstViewCopy: z.string().trim().max(60),
      visualDirection: z.string().trim().max(300),
      cta: z.enum(["BOOK_NOW", "LEARN_MORE", "APPLY_NOW", "SIGN_UP", "CONTACT_US"]),
    }),
  }),
]);

export async function reviewCreativeAction(creativeId: ID, review: z.input<typeof reviewSchema>): Promise<ActionResult<{ status: string }>> {
  const parsedId = id.safeParse(creativeId);
  const parsed = reviewSchema.safeParse(review);
  if (!parsedId.success) return validationError(parsedId.error);
  if (!parsed.success) return validationError(parsed.error);
  const app = await requireAppContext();
  return run("Creativeの更新に失敗しました", async () => ({ status: (await reviewDraft(app, parsedId.data, parsed.data)).status }));
}

export async function rejectHypothesisAction(hypothesisId: ID): Promise<ActionResult> {
  const parsed = id.safeParse(hypothesisId);
  if (!parsed.success) return validationError(parsed.error);
  const app = await requireAppContext();
  return run("仮説の更新に失敗しました", async () => {
    await rejectHypothesis(app, parsed.data);
    return undefined;
  });
}

export async function createExperimentAction(hypothesisId: ID, creativeIds: ID[]): Promise<ActionResult<{ experimentId: ID }>> {
  const parsed = z.object({ hypothesisId: id, creativeIds: z.array(id).min(1, "Challengerを選んでください").max(2) }).safeParse({ hypothesisId, creativeIds });
  if (!parsed.success) return validationError(parsed.error);
  const app = await requireAppContext();
  return run("A/Bテストの作成に失敗しました", async () => ({ experimentId: (await createExperiment(app, parsed.data.hypothesisId, parsed.data.creativeIds)).id }));
}

const COMMANDS = ["approve", "launch_start", "launch_paused", "activate", "refresh", "complete", "complete_pause_losers", "cancel"] as const;

export async function experimentCommandAction(experimentId: ID, command: ExperimentCommand, confirmation?: string): Promise<ActionResult<{ status: string | null }>> {
  const parsed = z.object({ experimentId: id, command: z.enum(COMMANDS) }).safeParse({ experimentId, command });
  if (!parsed.success) return validationError(parsed.error);
  // Anything that changes Meta needs the typed final confirmation from the dialog.
  const metaChanging = command === "launch_start" || command === "launch_paused" || command === "activate" || command === "complete_pause_losers";
  if (metaChanging && confirmation !== "Metaへ反映") return { ok: false, error: "最終確認が必要です" };
  const app = await requireAppContext();
  if (metaChanging) {
    const rl = checkRateLimit(`ads-launch:${app.user.id}`, 10, 60 * 60_000);
    if (!rl.ok) return { ok: false, error: rateLimitMessage(rl.retryAfterSeconds) };
  }
  return run("操作に失敗しました", async () => ({ status: (await runExperimentCommand(app, parsed.data.experimentId, parsed.data.command))?.status ?? null }));
}

const campaignSchema = z.object({
  goal: z.enum(["acquisition", "recruitment"]),
  landingPageUrl: z.union([z.literal(""), z.string().trim().url("URLの形式が正しくありません").max(500)]),
  locationId: z.union([z.literal(""), id]),
  conversionEvent: z.string().trim().max(80),
});

export async function updateCampaignSettingsAction(campaignId: ID, input: z.input<typeof campaignSchema>): Promise<ActionResult> {
  const parsedId = id.safeParse(campaignId);
  const parsed = campaignSchema.safeParse(input);
  if (!parsedId.success) return validationError(parsedId.error);
  if (!parsed.success) return validationError(parsed.error);
  const app = await requireAppContext();
  return run("キャンペーン設定の保存に失敗しました", async () => {
    await updateCampaignSettings(app, parsedId.data, {
      goal: parsed.data.goal,
      landingPageUrl: parsed.data.landingPageUrl || null,
      locationId: parsed.data.locationId || null,
      conversionEvent: parsed.data.conversionEvent || null,
    });
    return undefined;
  });
}

const manualSchema = z.object({
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付を入力してください"),
  kind: z.enum(CONVERSION_KINDS),
  count: z.coerce.number().int().min(0).max(100000),
  revenue: z.union([z.literal(""), z.coerce.number().min(0).max(1_000_000_000)]),
  campaignId: z.union([z.literal(""), id]),
  note: z.string().trim().max(300),
});

export async function recordConversionAction(input: z.input<typeof manualSchema>): Promise<ActionResult<{ saved: number }>> {
  const parsed = manualSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const app = await requireAppContext();
  return run("記録に失敗しました", async () => {
    const r = await recordConversions(app, {
      mode: "manual",
      rows: [{ occurredOn: parsed.data.occurredOn, kind: parsed.data.kind, count: parsed.data.count, revenue: parsed.data.revenue === "" ? null : parsed.data.revenue, campaignId: parsed.data.campaignId || null, note: parsed.data.note }],
    });
    return { saved: r.saved };
  });
}

export async function importConversionsCsvAction(csv: string): Promise<ActionResult<{ saved: number; errors: string[] }>> {
  if (typeof csv !== "string" || csv.length > 200_000) return { ok: false, error: "CSVが大きすぎます（200KBまで）" };
  const app = await requireAppContext();
  return run("CSVの取り込みに失敗しました", () => recordConversions(app, { mode: "csv", csv }));
}

export async function completeAdsConnectionAction(selection: { externalAccountId: string; locationId: string }[]): Promise<ActionResult<{ connected: number }>> {
  const parsed = z.array(z.object({ externalAccountId: z.string().regex(/^act_\d{1,30}$/), locationId: z.union([z.literal(""), id]) })).min(1, "広告アカウントを選んでください").max(25).safeParse(selection);
  if (!parsed.success) return validationError(parsed.error);
  const app = await requireAppContext();
  const jar = await cookies();
  const result = await run("接続に失敗しました", async () => {
    const accounts = await completeAdsConnection(
      app,
      jar.get(ADS_PENDING_COOKIE)?.value,
      parsed.data.map((s) => ({ externalAccountId: s.externalAccountId, locationId: s.locationId || null })),
    );
    return { connected: accounts.length };
  });
  if (result.ok) jar.set(ADS_PENDING_COOKIE, "", adsCookieOptions(0));
  return result;
}

export async function disconnectAdAccountAction(adAccountId: ID): Promise<ActionResult> {
  const parsed = id.safeParse(adAccountId);
  if (!parsed.success) return validationError(parsed.error);
  const app = await requireAppContext();
  return run("接続解除に失敗しました", async () => {
    await disconnectAdAccount(app, parsed.data);
    return undefined;
  });
}
