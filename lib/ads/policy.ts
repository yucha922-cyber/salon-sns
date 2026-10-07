/**
 * Pre-review policy check for ad copy (pure). Warnings only: a human makes
 * the final call in the review screen. Based on Meta Advertising Standards
 * (personal attributes, health & wellness, employment discrimination) and
 * Japanese advertising rules for 整体 (no medical efficacy claims).
 */
export interface PolicyWarning {
  level: "warn" | "info";
  code: "personal_attributes" | "health_claim" | "employment" | "before_after" | "length" | "absolute";
  message: string;
  match?: string;
}

const CONDITION = "(肩こり|肩コリ|腰痛|頭痛|首こり|痛み|不調|病気|症状|疾患|体重|肥満|薄毛|借金|うつ|不眠|不妊|障害|冷え性|むくみ|産後)";

const RULES: { re: RegExp; warning: Omit<PolicyWarning, "match"> }[] = [
  {
    re: new RegExp(`(あなた|貴方|君)(の|は|も|が)?[^。！？\\n]{0,14}${CONDITION}`),
    warning: { level: "warn", code: "personal_attributes", message: "「あなたの○○」のように見る人の健康状態を断定・示唆する表現は、Metaの個人属性ポリシーで不承認になりやすい表現です。「夕方の首肩のこわばりに」のように状況として書く案を検討してください。" },
  },
  {
    re: new RegExp(`(${CONDITION.slice(1, -1)}|首|肩|腰|体|肌)[^。！？\\n]{0,10}(あなた|貴方|方)(へ|に)`),
    warning: { level: "warn", code: "personal_attributes", message: "「○○に悩むあなたへ」型は個人の健康状態を示唆するため、Metaの個人属性ポリシーに抵触する可能性があります。" },
  },
  {
    re: new RegExp(`(その|あなたの)${CONDITION}`),
    warning: { level: "warn", code: "personal_attributes", message: "「その肩こり」のように見る人がその症状を持っている前提の表現は、Metaの個人属性ポリシーで指摘される可能性があります。" },
  },
  {
    re: /(治る|治す|完治|治療|改善を保証|根治|即効|劇的|医師も認め)/,
    warning: { level: "warn", code: "health_claim", message: "医療的な効果の断定に読める表現です（整体は医療行為ではないため、治る・治療・完治などは使えません）。" },
  },
  {
    re: /(必ず|絶対|100%|１００％|誰でも|確実に)/,
    warning: { level: "warn", code: "absolute", message: "効果を保証する断定表現です。誇大表現として不承認・景表法上のリスクがあります。" },
  },
  {
    re: /(男性|女性|[2-6]0代|若い|若手|年齢)[^。！？\n]{0,6}(限定|のみ|だけ|歓迎|募集)/,
    warning: { level: "warn", code: "employment", message: "採用広告（EMPLOYMENT）で性別・年齢を限定する表現は差別的とみなされる可能性があります。" },
  },
];

export function checkAdCopy(input: { headline?: string; primaryText?: string; firstViewCopy?: string; hook?: string; variable?: string | null }): PolicyWarning[] {
  const text = [input.hook, input.headline, input.firstViewCopy, input.primaryText].filter(Boolean).join("\n");
  const out: PolicyWarning[] = [];
  for (const { re, warning } of RULES) {
    const m = text.match(re);
    if (m && !out.some((w) => w.code === warning.code)) out.push({ ...warning, match: m[0] });
  }
  if (input.variable === "before_after") {
    out.push({ level: "info", code: "before_after", message: "Before/After表現は、体型・健康状態の比較画像がMetaのポリシーで制限されます。姿勢のシルエット比較など誇張のない表現にしてください。" });
  }
  if ((input.headline ?? "").length > 40) out.push({ level: "info", code: "length", message: `見出しが${input.headline?.length}文字です。配置によっては省略されます（目安40文字以内）。` });
  if ((input.primaryText ?? "").length > 125) out.push({ level: "info", code: "length", message: `本文が${input.primaryText?.length}文字です。冒頭125文字程度で要点が伝わるか確認してください。` });
  return out;
}

/** Character-bigram Jaccard similarity (0..1) — catches near-duplicate hooks. */
export function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const t = s.replace(/[\s、。！？!?「」『』…・]/g, "");
    const set = new Set<string>();
    for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
    return set;
  };
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}
