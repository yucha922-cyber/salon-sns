import type { BrandBrainInput } from "@/lib/domain/types";
import type { AIChatTurn, GenerateTextRequest } from "../provider";
import { brandSystemBlock, first, SAFETY_RULES } from "./shared";

/**
 * 専属AIマーケター: answers marketing questions as a member of the
 * customer's team, grounded in the current organization's Brand Brain.
 */
export function buildMarketingChatRequest(brain: BrandBrainInput, history: AIChatTurn[]): GenerateTextRequest {
  const { ctx, text } = brandSystemBlock(brain);
  const system = [
    `あなたは「${ctx.brand.name}」専属のAIマーケターです。SNS運用・広告・集客の相談に、チームの一員として具体的に答えます。`,
    "回答方針:",
    "- Brand Brainのターゲット・悩み・強み・トーンを必ず踏まえ、一般論ではなくこのブランド向けの提案にする。",
    "- 投稿案や広告案は、すぐ使える具体例（テーマ、構成、コピー例、CTA）で示す。",
    "- 日本語で、見出しや箇条書きを使い簡潔に。最後に次の一手を1つ提案する。",
    "- 投稿化したい案は「AI投稿作成」で作成・保存できることを必要に応じて案内する。",
    SAFETY_RULES,
    "",
    text,
  ].join("\n");

  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  return { system, messages: history, maxTokens: 4000, mockResponse: () => mockChatAnswer(brain, lastUser) };
}

function mockChatAnswer(brain: BrandBrainInput, question: string): string {
  const { ctx } = brandSystemBlock(brain);
  const name = ctx.brand.name || "貴社";
  const target = [ctx.targetAudience.ageRange, ctx.targetAudience.occupation].filter(Boolean).join("・") || "メインターゲット";
  const pain = first(ctx.painPoints, "日々の悩み");
  const pain2 = ctx.painPoints[1] ?? pain;
  const strength = first(ctx.strengths, "お店のこだわり");
  const service = ctx.services[0];
  const tone = first(ctx.brand.tone, "やさしく丁寧に");
  const q = question.toLowerCase();

  if (q.includes("広告") || q.includes("cpa") || q.includes("ad")) {
    return [
      `${name}の強み「${strength}」を軸にした広告案を3つ考えました。`,
      "",
      `**A. 悩み訴求** —「${pain}、仕事のせいだけ？」と${target}に問いかけ、原因から整えるアプローチを伝える。`,
      `**B. 強み訴求** —「${strength}」を前面に出し、他との違いを一目で伝える。`,
      `**C. 体験訴求** — ${service ? `「${service.name}」` : "初回メニュー"}を入口に、来店後の流れを見せて不安を減らす。`,
      "",
      `トーンは「${tone}」を守り、効果の断定は避けます。`,
      "次の一手: Creative Studioで3案のコンセプトを比較し、反応の良い切り口を1本に絞りましょう。",
      "",
      "※ 広告の配信設定や予算は、承認なしに変更されることはありません。",
    ].join("\n");
  }

  if (q.includes("30代") || q.includes("女性") || q.includes("向け") || q.includes("ターゲット")) {
    return [
      `${target}に向けた投稿案です。Brand Brainの悩み「${pain}」「${pain2}」に寄り添う構成にしました。`,
      "",
      `1. **共感型Reel**「夕方になると${pain}…そんな日の過ごし方」— 冒頭3秒で悩みに共感 → セルフケア1つ → プロフィール誘導`,
      `2. **保存型カルーセル**「${pain2}を招くNG習慣3選」— 1枚目で問いかけ、最後に「保存して見返してね」`,
      `3. **信頼型フィード**「${strength}って何をするの？」— 初めての方の不安を解消`,
      "",
      `文体は「${ctx.brand.writingTone || tone}」に合わせています。`,
      "次の一手: 気に入った案を「AI投稿作成」で本文まで仕上げ、投稿カレンダーに追加しましょう。",
    ].join("\n");
  }

  if (q.includes("instagram") || q.includes("投稿") || q.includes("sns") || q.includes("今月")) {
    return [
      `今月のInstagramは、${target}の「${pain}」をテーマに週3本のペースがおすすめです。`,
      "",
      "| 週 | 形式 | テーマ |",
      "|---|---|---|",
      `| 1週目 | Reel | ${pain}をやわらげる1分セルフケア |`,
      `| 2週目 | カルーセル | ${pain2}を招く習慣チェックリスト |`,
      `| 3週目 | フィード | 「${strength}」の舞台裏 |`,
      `| 4週目 | Reel | ${service ? `${service.name}の流れ紹介` : "はじめての方へのご案内"} |`,
      "",
      `SNS目標「${ctx.goals.social || "保存・プロフィール遷移を増やす"}」に合わせ、各投稿に保存を促すCTAを入れましょう。`,
      "次の一手: 1週目の投稿を「AI投稿作成」で作成しましょう。",
    ].join("\n");
  }

  return [
    `${name}のBrand Brainをもとに考えますね。`,
    "",
    `ご質問の「${question.slice(0, 60)}」については、${target}に「${strength}」を伝える切り口が合いそうです。`,
    `特に「${pain}」に悩む方へ、具体的な解決のイメージを見せると反応が得やすくなります。`,
    "",
    "進め方の例:",
    `1. 悩みに共感する投稿で認知を広げる`,
    `2. ${strength}を伝える投稿で信頼をつくる`,
    `3. ${service ? `「${service.name}」` : "体験メニュー"}への導線で予約につなげる`,
    "",
    "次の一手: 具体的な投稿にしたい場合は「AI投稿作成」で形式とテーマを指定してください。",
  ].join("\n");
}
