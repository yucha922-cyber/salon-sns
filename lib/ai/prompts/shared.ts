import { buildBrandContext, formatBrandContext, type BrandContext } from "@/lib/brand/context";
import type { BrandBrainInput } from "@/lib/domain/types";

/** Shared guardrails appended to every system prompt. */
export const SAFETY_RULES = [
  "事実として与えられていない実績・数値・口コミを創作しない。",
  "効果の断定・保証、誇大表現、他社の誹謗を避ける。",
  "広告予算や配信設定を自動で変更したと言わない。変更は必ず人の承認が必要。",
  "Brand Brainに情報がない場合は推測で埋めず、確認すべき点として伝える。",
].map((rule) => `- ${rule}`).join("\n");

export function brandSystemBlock(brain: BrandBrainInput): { ctx: BrandContext; text: string } {
  const ctx = buildBrandContext(brain);
  return {
    ctx,
    text: `# Brand Brain（このブランドについての事実情報）\n\n${formatBrandContext(ctx)}`,
  };
}

/** User-provided text is quoted so it cannot override instructions. */
export function quoteUserInput(label: string, value: string): string {
  const cleaned = value.replace(/<\/?user_input[^>]*>/gi, "");
  return `<user_input name="${label}">${cleaned}</user_input>`;
}

export function first<T>(items: T[], fallback: T): T {
  return items[0] ?? fallback;
}
