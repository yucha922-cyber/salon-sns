"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppContext } from "@/lib/auth/context";
import { chatMessageSchema, generatePostRequestSchema } from "@/lib/domain/schemas";
import type { ChatMessage } from "@/lib/domain/types";
import { validationError, type ActionResult } from "@/lib/actions";
import { getAIProvider } from "@/lib/ai";
import { buildMarketingChatRequest } from "@/lib/ai/prompts/marketing-chat";
import { buildPostCreatorRequest } from "@/lib/ai/prompts/post-creator";
import { buildCreativeStudioRequest } from "@/lib/ai/prompts/creative-studio";
import { buildAdAnalysisRequest } from "@/lib/ai/prompts/ad-analysis";
import type { AdAnalysis, CreativeConcepts, PostDraft } from "@/lib/ai/schemas";
import { getCampaigns } from "@/lib/services/analytics";
import { formatPortfolioContext } from "@/lib/brand/context";
import { findLocation } from "@/lib/services/localization";
import { toUserMessage } from "@/lib/services/errors";

const MAX_HISTORY = 20;

export async function sendChatMessageAction(
  input: unknown,
): Promise<ActionResult<{ conversationId: string; userMessage: ChatMessage; reply: ChatMessage; provider: string }>> {
  const parsed = chatMessageSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { repo, current, brain } = await requireAppContext();
    const orgId = current.organization.id;
    let conversation = parsed.data.conversationId
      ? await repo.getConversation(orgId, parsed.data.conversationId)
      : null;
    if (!conversation) {
      const created = await repo.createConversation(orgId, parsed.data.content.slice(0, 40));
      conversation = { ...created, messages: [] };
    }
    const userMessage = await repo.appendMessage(orgId, conversation.id, { role: "user", content: parsed.data.content });
    const history = [...conversation.messages, userMessage]
      .slice(-MAX_HISTORY)
      .map(({ role, content }) => ({ role, content }));

    const [accounts, locations] = await Promise.all([repo.listAccounts(orgId), repo.listLocationProfiles(orgId)]);
    const provider = getAIProvider();
    const { text } = await provider.generateText(
      buildMarketingChatRequest(brain, history, formatPortfolioContext(accounts, locations)),
    );
    const reply = await repo.appendMessage(orgId, conversation.id, {
      role: "assistant",
      content: text,
      aiProvider: provider.name,
    });
    revalidatePath("/chat");
    return { ok: true, data: { conversationId: conversation.id, userMessage, reply, provider: provider.name } };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "AIマーケターの応答に失敗しました") };
  }
}

const postScopeSchema = z.object({
  accountId: z.string().max(64).nullable().optional(),
  locationId: z.string().max(64).nullable().optional(),
  hqCampaignId: z.string().max(64).nullable().optional(),
});

export async function generatePostAction(
  input: unknown,
  scopeInput: unknown = {},
): Promise<ActionResult<{ draft: PostDraft; provider: string }>> {
  const parsed = generatePostRequestSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const scopeIds = postScopeSchema.safeParse(scopeInput);
  if (!scopeIds.success) return validationError(scopeIds.error);
  try {
    const { brain, repo, current } = await requireAppContext();
    const orgId = current.organization.id;
    // Resolve ids only within the current organization.
    const [accounts, locations, campaigns] = await Promise.all([
      repo.listAccounts(orgId),
      repo.listLocationProfiles(orgId),
      repo.listHqCampaigns(orgId),
    ]);
    const account = accounts.find((a) => a.id === scopeIds.data.accountId) ?? null;
    const location = findLocation(locations, scopeIds.data.locationId ?? account?.locationId);
    const campaign = campaigns.find((c) => c.id === scopeIds.data.hqCampaignId) ?? null;
    const provider = getAIProvider();
    const { object } = await provider.generateStructuredObject(
      buildPostCreatorRequest(brain, parsed.data, { account, location, campaign }),
    );
    return { ok: true, data: { draft: object, provider: provider.name } };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "投稿の生成に失敗しました") };
  }
}

const creativeBriefSchema = z.object({
  objective: z.string().trim().min(1).max(100),
  service: z.string().trim().min(1).max(200),
  target: z.string().trim().min(1).max(200),
  message: z.string().trim().max(500),
  placement: z.string().trim().min(1).max(100),
});

export async function generateCreativeConceptsAction(
  input: unknown,
): Promise<ActionResult<{ concepts: CreativeConcepts["concepts"]; provider: string }>> {
  const parsed = creativeBriefSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { brain } = await requireAppContext();
    const provider = getAIProvider();
    const { object } = await provider.generateStructuredObject(buildCreativeStudioRequest(brain, parsed.data));
    return { ok: true, data: { concepts: object.concepts, provider: provider.name } };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "コンセプトの生成に失敗しました") };
  }
}

export async function analyzeAdsAction(): Promise<ActionResult<{ insights: AdAnalysis["insights"]; provider: string }>> {
  try {
    const { brain, current } = await requireAppContext();
    const campaigns = getCampaigns(current.organization);
    if (!campaigns.length) return { ok: false, error: "分析できる広告データがありません（Meta広告は未連携です）" };
    const provider = getAIProvider();
    const { object } = await provider.generateStructuredObject(buildAdAnalysisRequest(brain, campaigns));
    return { ok: true, data: { insights: object.insights, provider: provider.name } };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "広告分析に失敗しました") };
  }
}
