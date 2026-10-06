/**
 * buildBrandContext() — the single place that turns a Brand Brain into the
 * context every AI feature receives (chat, post creator, creative studio,
 * ad analysis). Features must not assemble brand info on their own, so the
 * AI always sees the same, complete, consistently ordered picture.
 */
import type { BrandBrainInput } from "@/lib/domain/types";
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
