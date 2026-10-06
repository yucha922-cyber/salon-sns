"use server";

import { revalidatePath } from "next/cache";
import { requireAppContext } from "@/lib/auth/context";
import { savePostSchema, updatePostSchema } from "@/lib/domain/schemas";
import type { Post, PostStatus } from "@/lib/domain/types";
import { EDITABLE_POST_STATUSES } from "@/lib/domain/types";
import { revokeApproval } from "@/lib/social/publish-queue";
import { validationError, type ActionResult } from "@/lib/actions";
import { toUserMessage } from "@/lib/services/errors";
import { getAIProvider } from "@/lib/ai";

export async function savePostAction(input: unknown): Promise<ActionResult<Post>> {
  const parsed = savePostSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;
  if (data.status === "scheduled" && !data.scheduledAt) {
    return { ok: false, error: "予約するには日時を指定してください", fieldErrors: { scheduledAt: "日時を指定してください" } };
  }
  try {
    const { repo, current } = await requireAppContext();
    if (current.role === "viewer") return { ok: false, error: "閲覧権限のため保存できません" };
    const post = await repo.createPost(current.organization.id, {
      ...data,
      hashtags: data.hashtags.filter(Boolean).map((h) => (h.startsWith("#") ? h : `#${h}`)),
      source: data.generationInput ? "ai_post_creator" : "manual",
      aiProvider: data.generationInput ? getAIProvider().name : undefined,
      accountId: data.accountId ?? null,
      locationId: data.locationId ?? null,
      hqCampaignId: data.hqCampaignId ?? null,
      planning: { hook: data.hook ?? "", theme: data.generationInput?.theme ?? "" },
    });
    revalidatePath("/planner");
    revalidatePath("/posts");
    revalidatePath("/dashboard");
    return { ok: true, data: post };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "投稿の保存に失敗しました") };
  }
}

export async function updatePostAction(input: unknown): Promise<ActionResult<Post>> {
  const parsed = updatePostSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { id, ...patch } = parsed.data;
  if (patch.status === "scheduled" && !patch.scheduledAt) {
    return { ok: false, error: "予約するには日時を指定してください" };
  }
  try {
    const app = await requireAppContext();
    const { repo, current } = app;
    if (current.role === "viewer") return { ok: false, error: "閲覧権限のため保存できません" };
    const existing = (await repo.listPosts(current.organization.id)).find((p) => p.id === id);
    if (!existing) return { ok: false, error: "投稿が見つかりません" };
    if (existing.status === "queued" || existing.status === "publishing") {
      return { ok: false, error: "予約投稿に登録済みのため編集できません。「予約を取り消す」を押してから編集してください。" };
    }
    if (patch.status !== existing.status && !(EDITABLE_POST_STATUSES as readonly string[]).includes(patch.status)) {
      return { ok: false, error: "このステータスは投稿の承認・予約操作からのみ変更できます" };
    }
    if (patch.accountId !== undefined && patch.accountId !== null) {
      const account = (await repo.listAccounts(current.organization.id)).find((a) => a.id === patch.accountId);
      if (!account || account.platform !== existing.platform) return { ok: false, error: "投稿と同じプラットフォームのアカウントを選択してください" };
    }
    // Approval covers exactly the approved content: editing it withdraws the approval.
    const contentChanged =
      patch.title !== existing.title ||
      patch.caption !== existing.caption ||
      (patch.cta !== undefined && patch.cta !== existing.cta) ||
      (patch.hashtags !== undefined && patch.hashtags.join(" ") !== existing.hashtags.join(" ")) ||
      (patch.accountId !== undefined && patch.accountId !== existing.accountId);
    let status: PostStatus = patch.status;
    // A post published through the API stays published (its result is the record).
    if (existing.status === "published" && existing.publishing.providerPostId) status = "published";
    if (existing.status === "approved") {
      status = contentChanged ? (patch.scheduledAt ? "scheduled" : "draft") : "approved";
      if (contentChanged) await revokeApproval(app, id).catch(() => undefined);
    }
    const post = await repo.updatePost(current.organization.id, id, { ...patch, status });
    revalidatePath("/planner");
    revalidatePath("/posts");
    revalidatePath("/dashboard");
    return { ok: true, data: post };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "投稿の更新に失敗しました") };
  }
}
