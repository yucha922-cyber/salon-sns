import type { BrandBrainInput } from "@/lib/domain/types";
import type { GeneratePostRequest } from "@/lib/domain/schemas";
import { CONTENT_TYPE_LABELS, PLATFORM_LABELS } from "@/lib/domain/labels";
import type { GenerateObjectRequest } from "../provider";
import { postDraftSchema, type PostDraft } from "../schemas";
import { brandSystemBlock, first, quoteUserInput, SAFETY_RULES } from "./shared";

export function buildPostCreatorRequest(
  brain: BrandBrainInput,
  input: GeneratePostRequest,
): GenerateObjectRequest<PostDraft> {
  const { ctx, text } = brandSystemBlock(brain);
  const platform = PLATFORM_LABELS[input.platform];
  const format = CONTENT_TYPE_LABELS[input.contentType];
  const system = [
    `あなたは「${ctx.brand.name}」のSNS編集者です。Brand Brainに沿って、そのまま投稿できる${platform}の${format}投稿を作ります。`,
    "出力ルール:",
    "- title: 投稿の見出し（画像のメインコピーにもなる、30文字以内）",
    "- caption: 本文。冒頭1行で読者の悩みに共感し、ブランドのトーンで書く。改行で読みやすく。",
    "- cta: 保存・プロフィール遷移・予約など、目的に合う行動喚起を1文。",
    "- hashtags: '#'付きで5〜8個。地域・業種・悩みを組み合わせる。",
    platform === "Threads" ? "- Threadsは会話的で短め（300文字以内）、ハッシュタグは1〜2個。" : "",
    SAFETY_RULES,
    "",
    text,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = [
    "次の条件で投稿を1本作成してください。",
    quoteUserInput("platform", platform),
    quoteUserInput("content_type", format),
    quoteUserInput("theme", input.theme),
    quoteUserInput("target", input.target || "Brand Brainのメインターゲット"),
    quoteUserInput("goal", input.goal || "保存・認知"),
    quoteUserInput("tone", input.tone || "Brand Brainのトーン"),
    input.notes ? quoteUserInput("notes", input.notes) : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    system,
    prompt,
    schema: postDraftSchema,
    schemaName: "post_draft",
    maxTokens: 4000,
    mockResponse: () => {
      const pain = first(ctx.painPoints, "毎日の小さな不調");
      const strength = first(ctx.strengths, "私たちのこだわり");
      const location = ctx.locations[0]?.name ?? ctx.brand.name;
      const target = input.target || ctx.targetAudience.occupation || "忙しいあなた";
      const area = ctx.locations[0]?.address.match(/(\S+?[区市町村])/)?.[1] ?? "";
      const industryTag = `#${(ctx.industry.label.split(/[\s/・]/)[0] ?? "").trim() || "サロン"}`;
      const isShort = input.platform === "threads";
      const caption = isShort
        ? `${target}の方、「${pain}」が気になっていませんか？\n${input.theme}について、${location}がやさしく解説します。`
        : [
            `${target}の方、こんなお悩みはありませんか？`,
            `「${pain}が続いている…」`,
            "",
            `今回は「${input.theme}」をテーマに、今日からできる小さな工夫をご紹介します。`,
            "",
            `${location}では「${strength}」を大切に、一人ひとりに合わせたケアをご提案しています。`,
          ].join("\n");
      return {
        title: input.theme.slice(0, 30),
        caption,
        cta:
          input.goal.includes("予約") || input.goal.includes("来店")
            ? "ご予約はプロフィールのリンクからどうぞ"
            : "保存して、あとで見返してくださいね",
        hashtags: (isShort
          ? [industryTag]
          : [area ? `#${area}${industryTag.slice(1)}` : industryTag, industryTag, `#${pain.replace(/\s/g, "")}`, "#セルフケア", `#${(ctx.brand.name || "サロン").replace(/\s/g, "")}`]
        ).filter((tag, i, all) => tag.length > 1 && all.indexOf(tag) === i),
      };
    },
  };
}
