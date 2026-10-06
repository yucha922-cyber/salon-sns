/**
 * AI monthly content plan. Posting slots (date/time/funnel stage) are
 * computed in code from the account's posting frequency; the AI fills
 * content into each slot. Acquisition and recruitment use deliberately
 * different funnels, guidance and idea logic — they never share content.
 */
import type {
  AccountGoal,
  BrandBrainInput,
  ContentPillar,
  ContentType,
  HqCampaign,
  LocationProfile,
  PlanItemInput,
  SnsAccount,
  SocialPlatform,
} from "@/lib/domain/types";
import type { ContentLearning } from "@/lib/social/types";
import { CONTENT_TYPE_LABELS, goalLabel, PLATFORM_LABELS } from "@/lib/domain/labels";
import { formatScopeContext } from "@/lib/brand/context";
import { FUNNELS } from "@/lib/brand/account-goals";
import { pillarLabel } from "@/lib/brand/content-pillars";
import type { PostingSlot } from "@/lib/planning/slots";
import type { GenerateObjectRequest } from "../provider";
import { monthlyPlanSchema, planItemRegenerationSchema, type MonthlyPlanOutput, type PlanContent } from "../schemas";
import { brandSystemBlock, quoteUserInput, SAFETY_RULES } from "./shared";
import type { z } from "zod";

// ---------------------------------------------------------------------------
// Allowed formats
// ---------------------------------------------------------------------------

export function allowedContentTypes(platform: SocialPlatform, goal: AccountGoal): ContentType[] {
  if (platform === "threads") return ["threads_text"];
  if (platform === "tiktok") return ["short_video", "staff", "educational"];
  if (platform === "facebook") return ["feed", "educational", "testimonial", "offer"];
  if (goal === "recruitment") return ["reel", "carousel", "feed", "story", "staff", "educational"];
  return ["reel", "carousel", "feed", "story", "before_after", "staff", "educational", "testimonial", "offer"];
}

// ---------------------------------------------------------------------------
// Goal-specific guidance (prompt)
// ---------------------------------------------------------------------------

const ACQUISITION_GUIDE = [
  "【集客アカウントの企画ルール】",
  "- ファネル: 認知 → 悩み → 教育 → 信頼 → 来店 → 予約。各枠に指定された funnelStage の役割を果たす企画にする。",
  "- 認知: 地域・職業の「あるある」で見つけてもらう / 悩み: 症状と原因を言語化 / 教育: 体の仕組み・セルフケアで保存を狙う",
  "- 信頼: スタッフの専門性・許諾済みの口コミ・Before/After（誇張なし）/ 来店: 初回の流れ・FAQで不安を解消 / 予約: オファーと予約導線",
  "- CTAは段階に合わせる（前半は保存・フォロー、後半はLINE予約・プロフィールリンク）。",
].join("\n");

const RECRUITMENT_GUIDE = [
  "【採用アカウントの企画ルール】",
  "- 読み手はお客様ではなく求職者（セラピスト・理学療法士・柔道整復師など）。施術の宣伝・お客様向けオファーは書かない。",
  "- ファネル: 認知 → 興味 → 共感 → 職場理解 → キャリア理解 → 応募。各枠に指定された funnelStage の役割を果たす企画にする。",
  "- 認知: 働く人の日常で見つけてもらう / 興味: 技術・研修 / 共感: スタッフの想い・転職理由 / 職場理解: シフト・休日・チーム",
  "- キャリア理解: 3年後・5年後のキャリアパス / 応募: 見学・カジュアル面談の流れ",
  "- CTAは前半はフォロー・保存、後半は採用ページ・DMでの相談。給与・待遇は事実のみ。",
].join("\n");

function goalGuide(goal: AccountGoal): string {
  if (goal === "acquisition") return ACQUISITION_GUIDE;
  if (goal === "recruitment") return RECRUITMENT_GUIDE;
  return `【${goalLabel(goal)}アカウントの企画ルール】\n- ファネル: ${FUNNELS[goal].join(" → ")}。各枠の funnelStage に合わせる。`;
}

export interface MonthlyPlanContext {
  brain: BrandBrainInput;
  account: SnsAccount;
  location: LocationProfile | null;
  campaign: HqCampaign | null;
  pillars: ContentPillar[];
  slots: PostingSlot[];
  month: string; // YYYY-MM
  notes: string;
  /** Marketing Memory relevant to this account (learned from real metrics). */
  memory?: ContentLearning[];
}

function systemPrompt(c: MonthlyPlanContext): string {
  const { ctx, text } = brandSystemBlock(c.brain);
  const types = allowedContentTypes(c.account.platform, c.account.goal);
  return [
    `あなたは「${ctx.brand.name}」のSNS編集長です。${PLATFORM_LABELS[c.account.platform]} ${c.account.handle} の${c.month}の投稿企画を作ります。`,
    goalGuide(c.account.goal),
    "共通ルール:",
    "- 与えられた各 slot に1つずつ企画を作る（slot番号を必ず返す）。日付・時間はコード側で決めるので変更しない。",
    `- contentType は ${types.join(" / ")} のいずれか。同じ形式・同じテーマを続けない。`,
    "- theme は投稿の主題（30文字以内）、hook は冒頭1文（スクロールを止める言葉）、summary は構成の要約（2〜3文）。",
    "- contentPillar はアカウント戦略の柱から選ぶ。target はその投稿で狙う具体的な人。",
    c.campaign ? "- HQ Campaign の共通テーマを月の企画の一部（目安30〜50%）に反映し、必須メッセージは該当する投稿に必ず入れる。" : "",
    SAFETY_RULES,
    "",
    text,
    `\n${formatScopeContext({ account: c.account, location: c.location, campaign: c.campaign, memory: c.memory })}`,
    c.memory?.length ? "- Marketing Memoryの学び（確度の高いもの）を企画の配分・切り口に反映し、summaryの末尾に反映した学びを一言添える。" : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function slotList(slots: PostingSlot[]): string {
  return slots.map((s) => `- slot ${s.index}: ${s.date}（${"日月火水木金土"[s.weekday]}）${s.time} / funnelStage=${s.funnelStage}`).join("\n");
}

export function buildMonthlyPlanRequest(c: MonthlyPlanContext): GenerateObjectRequest<MonthlyPlanOutput> {
  return {
    system: systemPrompt(c),
    prompt: [
      `${c.month} の投稿枠（${c.slots.length}件 / 週${c.account.strategy.postsPerWeek}本ペース）:`,
      slotList(c.slots),
      c.notes ? quoteUserInput("notes", c.notes) : "",
      "summary には今月の企画意図を2〜3文で書いてください。",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: monthlyPlanSchema,
    schemaName: "monthly_plan",
    maxTokens: 16000,
    mockResponse: () => ({
      summary: `${mockSummary(c)}${c.memory?.[0] ? ` Marketing Memoryの学び「${c.memory[0].learning}」を踏まえ、反応の良い型の比率を高めています。` : ""}`,
      items: c.slots.map((slot) => mockIdea(c, slot, 0)),
    }),
  };
}

export function buildPlanItemRegenerationRequest(
  c: MonthlyPlanContext,
  slot: PostingSlot,
  previous: { theme: string; contentType: ContentType },
  instruction: string,
  attempt: number,
): GenerateObjectRequest<z.infer<typeof planItemRegenerationSchema>> {
  return {
    system: systemPrompt(c),
    prompt: [
      "次の1枠だけ、別の企画に作り直してください。",
      slotList([slot]),
      `直前の案（これとは違うものにする）: ${CONTENT_TYPE_LABELS[previous.contentType]}「${previous.theme}」`,
      instruction ? quoteUserInput("instruction", instruction) : "",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: planItemRegenerationSchema,
    schemaName: "plan_item",
    maxTokens: 3000,
    mockResponse: () => ({ item: mockIdea(c, slot, attempt) }),
  };
}

// ---------------------------------------------------------------------------
// Normalization: AI output → plan items (one per slot, validated)
// ---------------------------------------------------------------------------

export function toPlanItems(c: MonthlyPlanContext, contents: PlanContent[]): PlanItemInput[] {
  return c.slots.map((slot) => {
    const content = contents.find((x) => x.slot === slot.index) ?? mockIdea(c, slot, 0);
    return toPlanItem(c, slot, content);
  });
}

export function toPlanItem(c: MonthlyPlanContext, slot: PostingSlot, content: PlanContent): PlanItemInput {
  const types = allowedContentTypes(c.account.platform, c.account.goal);
  const pillar =
    c.pillars.find((p) => p.key === content.contentPillar || p.label === content.contentPillar)?.key ?? content.contentPillar;
  return {
    scheduledDate: slot.date,
    scheduledTime: slot.time,
    platform: c.account.platform,
    contentType: types.includes(content.contentType) ? content.contentType : types[0]!,
    theme: content.theme,
    hook: content.hook,
    summary: content.summary,
    goal: c.account.goal,
    target: content.target,
    contentPillar: pillar,
    funnelStage: slot.funnelStage,
    cta: content.cta || c.account.strategy.cta,
  };
}

// ---------------------------------------------------------------------------
// Mock ideas (no API key) — separate logic per goal
// ---------------------------------------------------------------------------

function mockSummary(c: MonthlyPlanContext): string {
  const name = c.location?.locationName ?? c.account.displayName ?? c.account.handle;
  const campaignNote = c.campaign ? `本部テーマ「${c.campaign.name}」を軸に、必須メッセージは該当する投稿に入れます。` : "";
  if (c.account.goal === "recruitment") {
    return `${name}の採用アカウントとして、前半は働く人の日常と研修で興味を集め、後半はキャリアパスと見学案内で応募につなげます。${c.campaign ? `本部テーマ「${c.campaign.name}」は職場の取り組みとして紹介します。` : ""}`;
  }
  if (c.account.goal === "acquisition") {
    return `${name}の集客アカウントとして、前半は${c.location?.area ?? "地域"}の${c.account.strategy.targetAudience || "ターゲット"}に向けた悩みの共感と教育、後半は信頼づくりと予約導線に重心を移します。${campaignNote}`;
  }
  return `${name}の${goalLabel(c.account.goal, c.account.customGoal)}アカウントとして、${FUNNELS[c.account.goal].join("→")}の流れで、コンテンツの柱をバランスよく発信します。${campaignNote}`;
}

type Idea = { theme: string; hook: string; summary: string; type: ContentType; pillar: string };

function acquisitionIdeas(c: MonthlyPlanContext, stage: string): Idea[] {
  const { ctx } = brandSystemBlock(c.brain);
  const area = c.location?.area || ctx.locations[0]?.name || "このエリア";
  const pains = ctx.painPoints.length ? ctx.painPoints : ["肩こり", "姿勢の崩れ"];
  const pain = pains[0]!;
  const pain2 = pains[1] ?? pain;
  const staff = c.location?.staff[0];
  const offer = c.location?.offers[0] ?? c.campaign?.requiredMessages[0] ?? "初回カウンセリング";
  const service = c.location?.featuredServices[0] ?? ctx.services[0]?.name ?? "初回メニュー";
  const theme = c.campaign?.sharedTheme.split(/[。、]/)[0];
  const byStage: Record<string, Idea[]> = {
    認知: [
      { theme: `${area}で働く人の${pain}あるある`, hook: `夕方、${pain}で集中が切れていませんか？`, summary: `${area}勤務の人が共感する日常シーンから入り、${pain}の入口に気づいてもらう。`, type: "reel", pillar: "problem_awareness" },
      { theme: theme ?? `デスクワーク中のNG姿勢`, hook: "その座り方、実は首に負担です", summary: "よくあるNG姿勢を3つ見せ、保存を促す。", type: "carousel", pillar: "education" },
    ],
    悩み: [
      { theme: `${pain}が続く3つの原因`, hook: `マッサージしても${pain}が戻るのはなぜ？`, summary: `${pain}の原因を姿勢・習慣・筋肉の3つで説明し、自分ごと化してもらう。`, type: "carousel", pillar: "problem_awareness" },
      { theme: `${pain2}セルフチェック`, hook: "30秒でできる、あなたの姿勢チェック", summary: "壁を使ったセルフチェックで現状を知ってもらう。", type: "reel", pillar: "problem_awareness" },
    ],
    教育: [
      { theme: `1分でできる${pain}ケア`, hook: "仕事の合間に、座ったままできます", summary: "デスクでできるストレッチを3ステップで紹介。保存を促す。", type: "reel", pillar: "selfcare" },
      { theme: `${pain2}と姿勢の関係`, hook: `${pain2}は首だけの問題ではありません`, summary: "体のつながりを図解し、専門性を伝える。", type: "educational", pillar: "education" },
    ],
    信頼: [
      { theme: staff ? `${staff.role}${staff.name}が大切にしていること` : "スタッフの専門性紹介", hook: "はじめまして、担当スタッフです", summary: `${staff?.specialty ?? "得意分野"}と施術への考え方を紹介し、安心感をつくる。`, type: "staff", pillar: "staff_expertise" },
      { theme: "お客様の声（許諾済み）", hook: "「仕事帰りに寄れるから続けられる」", summary: "許諾を得た声を紹介。効果の断定はせず体験として伝える。", type: "testimonial", pillar: "testimonial" },
      { theme: "姿勢分析でわかる変化", hook: "施術前後の姿勢を比べてみました", summary: "許諾済みのBefore/Afterを誇張なく紹介。", type: "before_after", pillar: "before_after" },
    ],
    来店: [
      { theme: `${service}の流れ`, hook: "はじめての方へ、来店から施術まで", summary: "初回の流れを写真で見せ、来店の不安をなくす。", type: "carousel", pillar: "faq" },
      { theme: "よくある質問Q&A", hook: "服装は？時間は？よくある質問に答えます", summary: "来店前の不安にFAQで答える。", type: "feed", pillar: "faq" },
    ],
    予約: [
      { theme: `${offer}のご案内`, hook: `${area}で働くあなたへ、今月の特典です`, summary: `${offer}を案内し、LINE予約へ誘導する。${c.campaign?.requiredMessages[0] ? `必須メッセージ「${c.campaign.requiredMessages[0]}」を入れる。` : ""}`, type: "offer", pillar: "offer" },
      { theme: "今週の空き状況", hook: "仕事帰りの枠、まだ空いています", summary: "直近の予約枠を案内し、行動を後押しする。", type: "story", pillar: "offer" },
    ],
  };
  return byStage[stage] ?? byStage["認知"]!;
}

function recruitmentIdeas(c: MonthlyPlanContext, stage: string): Idea[] {
  const { ctx } = brandSystemBlock(c.brain);
  const brand = ctx.brand.name;
  const staff = c.location?.staff[0];
  const byStage: Record<string, Idea[]> = {
    認知: [
      { theme: `${brand}で働くセラピストの1日`, hook: "9:45出勤、最初にすることは？", summary: "出勤から退勤までをReelで見せ、働くイメージを持ってもらう。", type: "reel", pillar: "day_in_the_life" },
      { theme: "院内ツアー", hook: "スタッフルームまでお見せします", summary: "施術室・休憩室・研修スペースを紹介する。", type: "reel", pillar: "culture" },
    ],
    興味: [
      { theme: "入社1年目で身につく技術", hook: "未経験の手技も、3ヶ月で現場デビュー", summary: "研修カリキュラムと習得ステップを紹介する。", type: "carousel", pillar: "training" },
      { theme: "毎月の技術研修の様子", hook: "現役スタッフが講師です", summary: "研修の雰囲気と学べる内容を伝える。", type: "reel", pillar: "training" },
    ],
    共感: [
      { theme: staff ? `${staff.name}がこの仕事を選んだ理由` : "スタッフがこの仕事を選んだ理由", hook: "病院勤務から転職して変わったこと", summary: "転職理由と今のやりがいを本人の言葉で伝える。", type: "staff", pillar: "staff_story" },
      { theme: "社員インタビュー", hook: "「患者さんとじっくり向き合える」", summary: "現場スタッフの声で職場の価値観を伝える。", type: "reel", pillar: "employee_voice" },
    ],
    職場理解: [
      { theme: "シフトと休日のリアル", hook: "月の休みは何日？正直にお答えします", summary: "シフト例・休日・残業の実態を事実ベースで伝える。", type: "carousel", pillar: "benefits" },
      { theme: "チームの雰囲気", hook: "ミーティングでは何を話している？", summary: "チームの関係性と相談しやすさを伝える。", type: "feed", pillar: "culture" },
    ],
    キャリア理解: [
      { theme: "3年後のキャリアパス", hook: "施術者→教育担当→院長、選べる道", summary: "キャリアの選択肢と昇格の基準を説明する。", type: "carousel", pillar: "career" },
      { theme: "院長が語る、目指す未来", hook: "10年後、どんな整体院でありたいか", summary: "本部・院長のビジョンを伝え、長く働くイメージを持ってもらう。", type: "reel", pillar: "vision" },
    ],
    応募: [
      { theme: "見学・カジュアル面談の流れ", hook: "まずは話を聞くだけでも大丈夫です", summary: "見学から面談・応募までの流れを案内し、DMへ誘導する。", type: "carousel", pillar: "benefits" },
      { theme: "募集要項まとめ", hook: "今月の募集職種と条件", summary: "募集職種・条件を事実のみで整理し、採用ページへ誘導する。", type: "feed", pillar: "benefits" },
    ],
  };
  return byStage[stage] ?? byStage["認知"]!;
}

function genericIdeas(c: MonthlyPlanContext, stage: string): Idea[] {
  const { ctx } = brandSystemBlock(c.brain);
  const brand = ctx.brand.name;
  const strength = ctx.strengths[0] ?? "私たちのこだわり";
  const pain = ctx.painPoints[0] ?? "体の不調";
  const banks: Partial<Record<AccountGoal, Idea[]>> = {
    branding: [
      { theme: `${brand}が生まれた理由`, hook: "はじまりは、ひとりのお客様の言葉でした", summary: "創業の想いと大切にしていることを伝える。", type: "feed", pillar: "brand_story" },
      { theme: `専門家が考える「${pain}」の本当の原因`, hook: "よく言われる原因、実は少し違います", summary: "ブランドとしての専門的な見解をコラム形式で伝える。", type: "carousel", pillar: "expertise_column" },
      { theme: "全店舗のスタッフ紹介リレー", hook: "今週は渋谷・池袋・横浜から1人ずつ", summary: "店舗ネットワークのつながりと人の魅力を伝える。", type: "feed", pillar: "network" },
      { theme: `「${strength}」へのこだわり`, hook: "なぜ、ここまでやるのか", summary: "ブランドの強みを裏側から語る。", type: "reel", pillar: "brand_story" },
    ],
    engagement: [
      { theme: "あなたの肩こり度クイズ", hook: "3問で分かる、あなたの姿勢タイプ", summary: "参加型クイズでコメントを集める。", type: "story", pillar: "quiz" },
      { theme: "スタッフの朝のルーティン", hook: "開店30分前の院内をのぞいてみました", summary: "舞台裏で親近感をつくる。", type: "reel", pillar: "behind_the_scenes" },
      { theme: "みんなのセルフケア教えて", hook: "あなたの“これやると楽になる”は？", summary: "フォロワーの声を集めて会話を生む。", type: "feed", pillar: "quiz" },
    ],
    retention: [
      { theme: "施術後3日間の過ごし方", hook: "来店後のケアで、体の軽さが長持ちします", summary: "来店後のセルフケアを案内し、次回来店につなげる。", type: "carousel", pillar: "aftercare" },
      { theme: "通う頻度の目安", hook: "どのくらいのペースで通えばいい？", summary: "継続の目安とメリットを伝える。", type: "feed", pillar: "member_info" },
      { theme: "おうちでできる1分ケア", hook: "次の来店まで、これだけ続けてください", summary: "セルフケアで関係を保つ。", type: "reel", pillar: "selfcare" },
    ],
  };
  const bank = banks[c.account.goal];
  if (bank) return bank;
  const pillars = c.account.strategy.contentPillars.length ? c.account.strategy.contentPillars : ["brand_story"];
  return pillars.map((p) => ({
    theme: `${pillarLabel(p, c.pillars)}（${stage}）`,
    hook: `${pillarLabel(p, c.pillars)}について、今日はひとつだけ。`,
    summary: `${goalLabel(c.account.goal, c.account.customGoal)}の${stage}段階として${pillarLabel(p, c.pillars)}を発信する。`,
    type: "feed" as ContentType,
    pillar: p,
  }));
}

function mockIdea(c: MonthlyPlanContext, slot: PostingSlot, attempt: number): PlanContent {
  const ideas =
    c.account.goal === "acquisition"
      ? acquisitionIdeas(c, slot.funnelStage)
      : c.account.goal === "recruitment"
        ? recruitmentIdeas(c, slot.funnelStage)
        : genericIdeas(c, slot.funnelStage);
  const idea = ideas[(slot.index + attempt) % ideas.length]!;
  const isThreads = c.account.platform === "threads";
  return {
    slot: slot.index,
    contentType: isThreads ? "threads_text" : idea.type,
    theme: idea.theme,
    hook: idea.hook,
    summary: isThreads ? `${idea.summary} Threadsでは短い問いかけで会話を生む。` : idea.summary,
    target: c.account.strategy.targetAudience || c.location?.demographics || "",
    contentPillar: idea.pillar,
    cta: c.account.strategy.cta,
  };
}
