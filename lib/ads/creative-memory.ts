/**
 * Creative Memory (pure helpers).
 *   Brand Brain      = what the company is (facts, tone, services)
 *   Marketing Memory = what worked in organic SNS operations (content_learnings kind=content)
 *   Creative Memory  = what won in ad creative tests (content_learnings kind=creative,
 *                      attributes = persona / pain / hook / angle / variable / principle …)
 *
 * Next creatives reuse the PRINCIPLE of a winner, not its wording:
 *   「仕事終わり」が勝った → principle "生活シーン（時間帯）を具体化" →
 *   残業後 / 夕方 / PC作業8時間後 / 帰宅時 … in new expressions.
 */
import type { ContentLearning } from "@/lib/social/types";
import type { AdGoal, CreativeAngle, TestVariable } from "./types";

export const ANGLE_LABELS: Record<CreativeAngle, string> = {
  problem: "Problem（悩み）",
  desire: "Desire（理想）",
  before_after: "Before / After",
  expertise: "Expertise（専門性）",
  social_proof: "Social Proof（実績・声）",
  myth_busting: "Myth Busting（誤解を解く）",
  how_to: "How-to",
  comparison: "Comparison（比較）",
  urgency: "Urgency（期限）",
  offer: "Offer（特典）",
  lifestyle: "Lifestyle（生活シーン）",
  identity: "Identity（自分ごと化）",
  career: "Career（キャリア）",
  culture: "Culture（社風）",
  training: "Training（研修）",
  salary: "Salary（待遇）",
  global_opportunity: "Global Opportunity",
  employee_story: "Employee Story（社員の声）",
};

export const VARIABLE_LABELS: Record<TestVariable, string> = {
  hook: "Hook（冒頭の一言）",
  visual: "Visual",
  persona: "Persona",
  offer: "Offer",
  cta: "CTA",
  social_proof: "Social Proof",
  before_after: "Before / After",
  problem_angle: "Problem Angle",
  expertise_angle: "Expertise Angle",
  price: "Price",
  format: "Format（画像/動画）",
  landing_page: "Landing Page",
};

export const GOAL_ANGLES: Record<AdGoal, CreativeAngle[]> = {
  acquisition: ["lifestyle", "problem", "expertise", "myth_busting", "how_to", "desire", "social_proof", "before_after", "offer", "identity", "comparison", "urgency"],
  recruitment: ["employee_story", "career", "culture", "training", "salary", "global_opportunity"],
};

/** Principle → concrete scenes to re-express it (used by the mock generator and as AI hints). */
export const PRINCIPLE_EXPANSIONS: { match: RegExp; principle: string; scenes: string[] }[] = [
  {
    match: /仕事終わり|夕方|残業|帰宅|昼休み|定時|生活シーン|時間帯|PC作業/,
    principle: "生活シーン（時間帯・場面）を具体的に描く",
    scenes: ["PC作業8時間後", "定時後の30分", "残業続きの水曜日", "帰りの電車で", "夕方17時", "会議が続いた日"],
  },
  {
    match: /社員|1日|ストーリー|employee_story|リアル/,
    principle: "働く人のリアルな1日・本人の言葉で伝える",
    scenes: ["入社2年目の1日", "未経験から1年後", "店長の朝礼", "休憩中のスタッフルーム", "初めて指名をもらった日"],
  },
  {
    match: /原因|分析|見える化|expertise|専門/,
    principle: "原因を見える化して専門性で納得させる",
    scenes: ["姿勢分析の画面", "座り方のクセ", "スマホ首のチェック", "骨盤の傾き"],
  },
];

export function principleOf(learning: Pick<ContentLearning, "learning" | "attributes">): { principle: string; scenes: string[] } | null {
  const text = [learning.attributes?.principle, learning.attributes?.winningPattern, learning.attributes?.angle, learning.learning].filter(Boolean).join(" ");
  const hit = PRINCIPLE_EXPANSIONS.find((p) => p.match.test(text));
  if (hit) return { principle: learning.attributes?.principle || hit.principle, scenes: hit.scenes };
  return learning.attributes?.principle ? { principle: learning.attributes.principle, scenes: [] } : null;
}

/** Relevance: same goal > same persona / pain > same location > confidence. Only kind=creative. */
export function rankCreativeLearnings(
  learnings: ContentLearning[],
  filter: { goal: AdGoal; persona?: string; painPoint?: string; locationId?: string | null },
): ContentLearning[] {
  const score = (l: ContentLearning) =>
    (l.attributes?.goal === filter.goal || l.goal === filter.goal ? 3 : 0) +
    (filter.persona && l.attributes?.persona && filter.persona.includes(l.attributes.persona.slice(0, 4)) ? 1 : 0) +
    (filter.painPoint && l.attributes?.painPoint === filter.painPoint ? 1 : 0) +
    (filter.locationId && l.locationId === filter.locationId ? 0.5 : 0) +
    l.confidence;
  return learnings
    .filter((l) => (l.kind ?? "content") === "creative" && l.status === "active")
    .filter((l) => !l.attributes?.goal || l.attributes.goal === filter.goal)
    .sort((a, b) => score(b) - score(a));
}

export function formatCreativeMemory(learnings: ContentLearning[]): string {
  if (!learnings.length) return "";
  return [
    "## Creative Memory（過去のA/Bテストで分かった勝ちパターン）",
    "- 勝ちパターンは『原則』として再利用し、同じ言い回しの焼き直しは作らない。",
    ...learnings.slice(0, 6).map((l) => {
      const a = l.attributes ?? {};
      return `- ${l.learning}${a.principle ? `（原則: ${a.principle}）` : ""}${a.winningPattern ? ` 勝ち: ${a.winningPattern}` : ""}${a.losingPattern ? ` / 負け: ${a.losingPattern}` : ""}（確度${Math.round(l.confidence * 100)}%）`;
    }),
  ].join("\n");
}

/**
 * Angles for the challengers: B keeps the angle that the memory / hypothesis
 * supports, C explores the least-used angle for this goal (avoid sameness).
 */
export function chooseAngles(goal: AdGoal, opts: { preferred?: CreativeAngle | null; recentAngles: string[] }): [CreativeAngle, CreativeAngle] {
  const list = GOAL_ANGLES[goal];
  const b = opts.preferred && list.includes(opts.preferred) ? opts.preferred : (list[0] as CreativeAngle);
  const counts = new Map<string, number>();
  for (const a of opts.recentAngles) counts.set(a, (counts.get(a) ?? 0) + 1);
  const c = list.filter((a) => a !== b).sort((x, y) => (counts.get(x) ?? 0) - (counts.get(y) ?? 0) || list.indexOf(x) - list.indexOf(y))[0] as CreativeAngle;
  return [b, c];
}
