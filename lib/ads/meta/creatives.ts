import "server-only";
import type { FetchLike } from "@/lib/social/http";
import { SocialApiError } from "@/lib/social/errors";
import type { AdsContext, CreativeDraftInput } from "../provider";
import { metaGraph } from "./client";

/**
 * POST /act_{id}/adcreatives (object_story_spec.link_data). The creative alone
 * does not deliver anything. Creative enhancements are explicitly OPTED OUT
 * (degrees_of_freedom_spec.creative_features_spec) so an A/B test compares
 * exactly what the human approved — Meta must not rewrite the text/image.
 * The Instagram identity uses instagram_user_id (instagram_actor_id is gone).
 */
const OPT_OUT_FEATURES = ["text_optimizations", "image_touchups", "image_template", "inline_comment", "video_auto_crop"];

export async function metaCreateCreative(ctx: AdsContext & { pageId: string | null; instagramUserId: string | null }, input: CreativeDraftInput, fetchImpl?: FetchLike): Promise<{ externalId: string }> {
  const pageId = input.pageId ?? ctx.pageId;
  if (!pageId) throw new SocialApiError("invalid_content", "meta_ads: page_id is required for object_story_spec");
  const spec: Record<string, unknown> = {
    page_id: pageId,
    link_data: {
      link: input.linkUrl,
      message: input.primaryText,
      name: input.headline,
      description: input.description,
      ...(input.imageUrl ? { picture: input.imageUrl } : {}),
      call_to_action: { type: input.callToActionType, value: { link: input.linkUrl } },
    },
  };
  if (ctx.instagramUserId) spec.instagram_user_id = ctx.instagramUserId;
  const res = await metaGraph(fetchImpl).post<{ id: string }>(
    `/${ctx.accountExternalId}/adcreatives`,
    {
      name: input.name,
      object_story_spec: JSON.stringify(spec),
      degrees_of_freedom_spec: JSON.stringify({ creative_features_spec: Object.fromEntries(OPT_OUT_FEATURES.map((f) => [f, { enroll_status: "OPT_OUT" }])) }),
      access_token: ctx.accessToken,
    },
    "meta_ads.create_creative",
  );
  return { externalId: res.id };
}

export async function metaPreview(ctx: AdsContext, creativeExternalId: string, format: string, fetchImpl?: FetchLike): Promise<{ html: string | null }> {
  const res = await metaGraph(fetchImpl).get<{ data?: { body?: string }[] }>(
    `/${creativeExternalId}/previews`,
    { ad_format: format, access_token: ctx.accessToken },
    "meta_ads.preview",
  );
  return { html: res.data?.[0]?.body ?? null };
}
