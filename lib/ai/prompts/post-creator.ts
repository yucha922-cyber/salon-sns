import type { BrandBrainInput } from "@/lib/domain/types";
import type { GeneratePostRequest } from "@/lib/domain/schemas";
import { CONTENT_TYPE_LABELS, PLATFORM_LABELS } from "@/lib/domain/labels";
import type { GenerateObjectRequest } from "../provider";
import { postDraftSchema, type PostDraft } from "../schemas";
import { brandSystemBlock, first, quoteUserInput, SAFETY_RULES } from "./shared";
import { formatScopeContext, type MarketingScope } from "@/lib/brand/context";

/**
 * Post generation. `scope` layers an account strategy, a location profile and
 * an HQ campaign on top of the Brand Brain (HQ localization uses this too).
 */
export function buildPostCreatorRequest(
  brain: BrandBrainInput,
  input: GeneratePostRequest,
  scope: MarketingScope = {},
): GenerateObjectRequest<PostDraft> {
  const { ctx, text } = brandSystemBlock(brain);
  const scopeText = formatScopeContext(scope);
  const { account, location, campaign } = scope;
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
    account ? "- Account Strategyの目的・コンテンツの柱・CTA・トーンを優先する。" : "",
    location ? "- Location Customizationのエリア・スタッフ・オファー・ローカルキーワードを自然に盛り込む。ハッシュタグにもローカルキーワードを使う。" : "",
    campaign ? "- HQ Campaignの共通テーマと共通クリエイティブの核となるメッセージは変えず、Localization Rulesに必ず従って店舗向けにローカライズする。" : "",
    SAFETY_RULES,
    "",
    text,
    scopeText ? `\n${scopeText}` : "",
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
      const locationName = location?.locationName ?? ctx.locations[0]?.name ?? ctx.brand.name;
      const area = location?.area || (ctx.locations[0]?.address.match(/(\S+?[区市町村])/)?.[1] ?? "");
      const target = input.target || location?.demographics || ctx.targetAudience.occupation || "忙しいあなた";
      const industryTag = `#${(ctx.industry.label.split(/[\s/・]/)[0] ?? "").trim() || "サロン"}`;
      const staff = location?.staff[0];
      const offer = location?.offers[0];
      const isShort = input.platform === "threads";
      const isRecruit = account?.goal === "recruitment";
      const headline = campaign?.creative.headline || input.theme;
      const body = isRecruit
        ? [
            `${locationName}で一緒に働く仲間を募集しています。`,
            "",
            `今回は「${input.theme}」をテーマに、${staff ? `${staff.role || "スタッフ"}の${staff.name}` : "スタッフ"}が働く環境をご紹介します。`,
            `「${strength}」を大切にできる職場です。`,
          ]
        : [
            `${area ? `${area}エリアの` : ""}${target}の方、こんなお悩みはありませんか？`,
            `「${pain}が続いている…」`,
            "",
            campaign ? `${campaign.name}：${headline}` : `今回は「${input.theme}」をテーマに、今日からできる小さな工夫をご紹介します。`,
            "",
            `${locationName}では「${strength}」を大切に、一人ひとりに合わせたケアをご提案しています。`,
            ...(staff ? [`担当：${staff.name}${staff.role ? `（${staff.role}）` : ""}`] : []),
            ...(campaign?.requiredMessages.length ? ["", ...campaign.requiredMessages.map((m) => `✔ ${m}`)] : []),
            ...(offer ? ["", `🎁 ${locationName}限定：${offer}`] : []),
          ];
      const caption = isShort
        ? `${target}の方、「${pain}」が気になっていませんか？\n${input.theme}について、${locationName}がやさしく解説します。${campaign?.requiredMessages[0] ? `\n✔ ${campaign.requiredMessages[0]}` : ""}`
        : body.join("\n");
      const localTags = (location?.localKeywords ?? []).map((k) => (k.startsWith("#") ? k : `#${k}`));
      const hashtags = isShort
        ? [localTags[0] ?? industryTag]
        : [...localTags, area ? `#${area}${industryTag.slice(1)}` : industryTag, industryTag, `#${pain.replace(/\s/g, "")}`, `#${(ctx.brand.name || "サロン").replace(/\s/g, "")}`];
      return {
        title: (campaign ? `${headline}｜${locationName}` : input.theme).slice(0, 60),
        caption,
        cta:
          account?.strategy.cta ||
          campaign?.cta ||
          (input.goal.includes("予約") || input.goal.includes("来店") ? "ご予約はプロフィールのリンクからどうぞ" : "保存して、あとで見返してくださいね"),
        hashtags: hashtags.filter((tag, i, all) => tag.length > 1 && all.indexOf(tag) === i).slice(0, 10),
      };
    },
  };
}
