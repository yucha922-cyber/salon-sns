"use server";

import { revalidatePath } from "next/cache";
import { requireAppContext } from "@/lib/auth/context";
import { savePostSchema, updatePostSchema } from "@/lib/domain/schemas";
import type { Post } from "@/lib/domain/types";
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
    const { repo, current } = await requireAppContext();
    const post = await repo.updatePost(current.organization.id, id, patch);
    revalidatePath("/planner");
    revalidatePath("/posts");
    revalidatePath("/dashboard");
    return { ok: true, data: post };
  } catch (error) {
    return { ok: false, error: toUserMessage(error, "投稿の更新に失敗しました") };
  }
}
