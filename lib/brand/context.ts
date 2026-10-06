/**
 * buildBrandContext() — the single place that turns a Brand Brain into the
 * context every AI feature receives (chat, post creator, creative studio,
 * ad analysis). Features must not assemble brand info on their own, so the
 * AI always sees the same, complete, consistently ordered picture.
 */
import type { BrandBrainInput, HqCampaign, KpiTarget, LocationProfile, SnsAccount } from "@/lib/domain/types";
import { goalLabel, PLATFORM_LABELS, WEEKDAY_LABELS } from "@/lib/domain/labels";
import { pillarLabel } from "./content-pillars";
import { findIndustryPreset } from "./industries";

export interface BrandContext {
  business: { companyName: string; description: string; website: string };
  brand: { name: string; personality: string[]; tone: string[]; writingTone: string };
  industry: { key: string; label: string; guidance: string | null };
  locations: { name: string; address: string }[];
  services: { name: string; description: string; price: number | null }[];
  serviceSummary: string;
  targetAudience: { summary: string; ageRange: string; gender: string; occupation: string; useCases: string[] };
  personas: { name: string; description: string }[];
  painPoints: string[];
  strengths: string[];
  features: string[];
  differentiators: string[];
  competitors: { name: string; note: string }[];
  socialAccounts: { platform: string; handle: string }[];
  goals: { marketing: string; social: string; advertising: string };
  notes: string;
}

export function buildBrandContext(brain: BrandBrainInput): BrandContext {
  const preset = findIndustryPreset(brain.industry.key);
  return {
    business: {
      companyName: brain.companyName,
      description: brain.businessDescription,
      website: brain.website,
    },
    brand: {
      name: brain.brandName || brain.companyName,
      personality: brain.brandPersonality,
      tone: brain.brandTone,
      writingTone: brain.writingTone,
    },
    industry: {
      key: brain.industry.key,
      label: brain.industry.label || preset?.label || "未設定",
      guidance: preset?.aiGuide ?? null,
    },
    locations: brain.locations.map(({ name, address }) => ({ name, address })),
    services: brain.services,
    serviceSummary: brain.serviceDescription,
    targetAudience: {
      summary: brain.targetAudience.summary,
      ageRange: brain.targetAudience.ageRange,
      gender: brain.targetAudience.gender,
      occupation: brain.targetAudience.occupation,
      useCases: brain.targetAudience.useCases,
    },
    personas: brain.personas,
    painPoints: brain.targetAudience.painPoints,
    strengths: brain.strengths,
    features: brain.features,
    differentiators: brain.differentiators,
    competitors: brain.competitors,
    socialAccounts: Object.entries(brain.social)
      .filter(([, handle]) => handle)
      .map(([platform, handle]) => ({ platform, handle })),
    goals: {
      marketing: brain.marketingGoals,
      social: brain.socialGoals,
      advertising: brain.advertisingGoals,
    },
    notes: brain.aiContext,
  };
}

const yen = (n: number | null) => (n === null ? "価格未設定" : `¥${n.toLocaleString("ja-JP")}`);
const join = (items: string[]) => (items.length ? items.join("、") : "未設定");
const orUnset = (value: string) => value.trim() || "未設定";

/**
 * Renders the context as a stable, sectioned text block for system prompts.
 * Section order is fixed so prompts stay cache-friendly.
 */
export function formatBrandContext(ctx: BrandContext): string {
  const lines: string[] = [];
  const section = (title: string, body: string[]) => {
    lines.push(`## ${title}`, ...body, "");
  };

  section("Business", [
    `- 会社名: ${orUnset(ctx.business.companyName)}`,
    `- 事業概要: ${orUnset(ctx.business.description)}`,
    `- Webサイト: ${orUnset(ctx.business.website)}`,
  ]);
  section("Brand", [
    `- ブランド名: ${orUnset(ctx.brand.name)}`,
    `- ブランドパーソナリティ: ${join(ctx.brand.personality)}`,
  ]);
  section("Industry", [
    `- 業種: ${ctx.industry.label} (${ctx.industry.key})`,
    ...(ctx.industry.guidance ? [`- 業種ガイドライン: ${ctx.industry.guidance}`] : []),
  ]);
  section(
    "Locations",
    ctx.locations.length ? ctx.locations.map((l) => `- ${l.name}${l.address ? `（${l.address}）` : ""}`) : ["- 未設定"],
  );
  section("Services", [
    ...(ctx.services.length
      ? ctx.services.map((s) => `- ${s.name} / ${yen(s.price)}${s.description ? ` — ${s.description}` : ""}`)
      : ["- 未設定"]),
    ...(ctx.serviceSummary ? [`- 補足: ${ctx.serviceSummary}`] : []),
  ]);
  section("Target Audience", [
    `- 概要: ${orUnset(ctx.targetAudience.summary)}`,
    `- 年齢: ${orUnset(ctx.targetAudience.ageRange)}`,
    `- 性別: ${orUnset(ctx.targetAudience.gender)}`,
    `- 職業: ${orUnset(ctx.targetAudience.occupation)}`,
    `- 利用シーン: ${join(ctx.targetAudience.useCases)}`,
  ]);
  section(
    "Personas",
    ctx.personas.length ? ctx.personas.map((p) => `- ${p.name}${p.description ? `: ${p.description}` : ""}`) : ["- 未設定"],
  );
  section("Pain Points", [`- ${join(ctx.painPoints)}`]);
  section("Strengths & Differentiators", [
    `- 強み: ${join(ctx.strengths)}`,
    `- 特徴: ${join(ctx.features)}`,
    `- 差別化ポイント: ${join(ctx.differentiators)}`,
    `- 競合: ${ctx.competitors.length ? ctx.competitors.map((c) => (c.note ? `${c.name}（${c.note}）` : c.name)).join("、") : "未設定"}`,
  ]);
  section("Brand Tone", [
    `- トーン: ${join(ctx.brand.tone)}`,
    `- 文章スタイル: ${orUnset(ctx.brand.writingTone)}`,
  ]);
  section("Marketing Goals", [
    `- 事業目標: ${orUnset(ctx.goals.marketing)}`,
    `- SNS目標: ${orUnset(ctx.goals.social)}`,
    `- 広告目標: ${orUnset(ctx.goals.advertising)}`,
  ]);
  if (ctx.socialAccounts.length) {
    section("Social Accounts", ctx.socialAccounts.map((s) => `- ${s.platform}: ${s.handle}`));
  }
  if (ctx.notes.trim()) section("Notes for AI", [ctx.notes.trim()]);
  return lines.join("\n").trim();
}

/** 0–100 score of how complete the Brand Brain is (drives UI hints). */
export function brandBrainCompleteness(brain: BrandBrainInput): { score: number; missing: string[] } {
  const checks: [string, boolean][] = [
    ["会社・ブランド名", Boolean(brain.brandName || brain.companyName)],
    ["業種", Boolean(brain.industry.label)],
    ["事業概要", Boolean(brain.businessDescription)],
    ["店舗", brain.locations.length > 0],
    ["サービス", brain.services.length > 0],
    ["強み", brain.strengths.length > 0],
    ["ターゲット", Boolean(brain.targetAudience.ageRange || brain.targetAudience.occupation || brain.targetAudience.summary)],
    ["悩み", brain.targetAudience.painPoints.length > 0],
    ["ブランドトーン", brain.brandTone.length > 0 || Boolean(brain.writingTone)],
    ["目標", Boolean(brain.marketingGoals || brain.socialGoals)],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([label]) => label);
  return { score: Math.round(((checks.length - missing.length) / checks.length) * 100), missing };
}

// ---------------------------------------------------------------------------
// Account / location / HQ layers on top of the Brand Brain
// ---------------------------------------------------------------------------

export interface MarketingScope {
  account?: SnsAccount | null;
  location?: LocationProfile | null;
  campaign?: HqCampaign | null;
}

export function formatKpis(kpis: KpiTarget[]): string {
  return kpis.map((k) => (k.target === null ? k.metric : `${k.metric} ${k.target}${k.unit}`)).join("、");
}

/**
 * Extra context sections layered on the Brand Brain, in a fixed order:
 * Account Strategy → Location Customization → HQ Campaign / Localization Rules.
 * Precedence for the AI: brand rules < account strategy < location facts,
 * while HQ required messages and localization rules are hard constraints.
 */
export function formatScopeContext(scope: MarketingScope): string {
  const lines: string[] = [];
  const { account, location, campaign } = scope;
  if (account) {
    const s = account.strategy;
    const days = s.preferredPostingDays.map((d) => WEEKDAY_LABELS[d]).join("・");
    lines.push(
      "## Account Strategy",
      `- アカウント: ${PLATFORM_LABELS[account.platform]} ${account.handle}${account.displayName ? `（${account.displayName}）` : ""}`,
      `- 目的: ${goalLabel(account.goal, account.customGoal)} (${account.goal})`,
      `- ターゲット: ${s.targetAudience || "Brand Brainのターゲットに従う"}`,
      `- ペルソナ: ${s.persona || "Brand Brainのペルソナに従う"}`,
      `- KPI: ${formatKpis(s.kpiTargets) || "未設定"}`,
      `- コンテンツの柱: ${s.contentPillars.map((p) => pillarLabel(p)).join("、") || "未設定"}`,
      `- 投稿頻度: 週${s.postsPerWeek}本${s.postingFrequencyNote ? `（${s.postingFrequencyNote}）` : ""}${days ? ` / 曜日: ${days}` : ""}${s.preferredPostingTimes.length ? ` / 時間: ${s.preferredPostingTimes.join("・")}` : ""}`,
      `- CTA戦略: ${s.cta || "未設定"}`,
      `- トーン: ${s.tone || "Brand Brainのトーンに従う"}`,
      ...(s.notes ? [`- 運用メモ: ${s.notes}`] : []),
      "",
    );
  }
  if (location) {
    lines.push(
      "## Location Customization",
      `- 店舗: ${location.locationName}${location.address ? `（${location.address}）` : ""}`,
      `- エリア: ${location.area || "未設定"}`,
      `- 商圏・客層: ${location.demographics || "未設定"}`,
      `- 店舗の注力サービス: ${location.featuredServices.join("、") || "Brand Brainのサービスに従う"}`,
      `- スタッフ: ${location.staff.map((s) => [s.name, s.role, s.specialty].filter(Boolean).join(" / ")).join("、") || "未設定"}`,
      `- 店舗独自のオファー: ${location.offers.join("、") || "なし"}`,
      `- ローカルキーワード: ${location.localKeywords.join("、") || "未設定"}`,
      "",
    );
  }
  if (campaign) {
    lines.push(
      "## HQ Campaign（本部テーマ）",
      `- キャンペーン: ${campaign.name}${campaign.startsOn ? `（${campaign.startsOn}〜${campaign.endsOn ?? ""}）` : ""}`,
      `- 目的: ${goalLabel(campaign.goal)}`,
      `- 共通テーマ: ${campaign.sharedTheme}`,
      ...(campaign.contentDirections.length ? [`- コンテンツの方向性: ${campaign.contentDirections.join(" / ")}`] : []),
      ...(campaign.optionalMessages.length ? [`- 任意で使えるメッセージ: ${campaign.optionalMessages.join(" / ")}`] : []),
      ...(campaign.cta ? [`- 共通CTA: ${campaign.cta}`] : []),
      `- 共通クリエイティブ: 見出し「${campaign.creative.headline}」/ 本文「${campaign.creative.body}」/ ビジュアル「${campaign.creative.visual}」`,
      "",
      "## Localization Rules（必ず守る）",
      ...campaign.requiredMessages.map((m) => `- 必須メッセージ「${m}」を必ず含める`),
      ...(campaign.localizationRules.length ? campaign.localizationRules.map((r) => `- ${r}`) : ["- 本部の共通メッセージを保ちつつ、店舗情報で具体化する"]),
      "",
    );
  }
  return lines.join("\n").trim();
}

/** Short overview of all accounts and locations for the AI marketer chat. */
export function formatPortfolioContext(accounts: SnsAccount[], locations: LocationProfile[]): string {
  if (!accounts.length && !locations.length) return "";
  const lines = ["## SNS Accounts & Locations"];
  for (const a of accounts) {
    const loc = locations.find((l) => l.locationId === a.locationId)?.locationName ?? "本部";
    lines.push(
      `- ${PLATFORM_LABELS[a.platform]} ${a.handle}（${loc} / 目的:${goalLabel(a.goal, a.customGoal)}${a.active ? "" : " / 停止中"} / 週${a.strategy.postsPerWeek}本 / KPI:${formatKpis(a.strategy.kpiTargets) || "未設定"} / 柱:${a.strategy.contentPillars.map((p) => pillarLabel(p)).join("・") || "未設定"}）`,
    );
  }
  for (const l of locations) {
    lines.push(`- 店舗 ${l.locationName}: エリア=${l.area || "未設定"} / 客層=${l.demographics || "未設定"} / キーワード=${l.localKeywords.join("・") || "未設定"} / オファー=${l.offers.join("・") || "なし"}`);
  }
  return lines.join("\n");
}
