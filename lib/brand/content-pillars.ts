import type { AccountGoal, ContentPillar } from "@/lib/domain/types";

/**
 * System content pillars. Mirrors the rows seeded by
 * supabase/migrations/20261008000000_sns_operations_loop.sql (organization_id = null)
 * so demo mode and tests use the same library.
 */
const SYSTEM: [AccountGoal, string, string, string][] = [
  ["acquisition", "education", "教育・専門知識", "体の仕組みや施術の考え方をわかりやすく伝える"],
  ["acquisition", "problem_awareness", "お悩み共感", "ターゲットの悩みを言語化して気づきを与える"],
  ["acquisition", "before_after", "Before / After", "変化を誇張せず、事実として見せる（許諾済み）"],
  ["acquisition", "testimonial", "お客様の声", "許諾を得た口コミ・体験談"],
  ["acquisition", "staff_expertise", "スタッフの専門性", "資格・得意分野・施術へのこだわり"],
  ["acquisition", "selfcare", "セルフケア", "今日からできるケアで保存を促す"],
  ["acquisition", "offer", "オファー・キャンペーン", "初回特典・期間限定の案内"],
  ["acquisition", "faq", "よくある質問", "来店前の不安を解消する"],
  ["recruitment", "staff_story", "スタッフストーリー", "この仕事を選んだ理由・成長の物語"],
  ["recruitment", "culture", "カルチャー", "チームの雰囲気・価値観"],
  ["recruitment", "career", "キャリアパス", "昇格・独立・専門性の伸ばし方"],
  ["recruitment", "training", "研修・教育", "入社後の研修制度と技術習得"],
  ["recruitment", "day_in_the_life", "1日の仕事", "出勤から退勤までのリアル"],
  ["recruitment", "benefits", "給与・福利厚生", "待遇・休日・働きやすさ"],
  ["recruitment", "vision", "ビジョン", "代表・本部が目指す未来"],
  ["recruitment", "employee_voice", "社員の声", "現場スタッフのインタビュー"],
  ["branding", "brand_story", "ブランドストーリー", "創業の想いと大切にしていること"],
  ["branding", "expertise_column", "専門コラム", "ブランドとしての専門的な見解"],
  ["branding", "network", "店舗ネットワーク", "各店舗の紹介とつながり"],
  ["engagement", "quiz", "クイズ・アンケート", "参加型で会話を生む"],
  ["engagement", "behind_the_scenes", "舞台裏", "日常の裏側で親近感をつくる"],
  ["retention", "aftercare", "アフターケア", "来店後のセルフケアと再来店のきっかけ"],
  ["retention", "member_info", "会員・回数券情報", "継続利用のメリット"],
];

export const SYSTEM_CONTENT_PILLARS: ContentPillar[] = SYSTEM.map(([goal, key, label, description]) => ({
  id: `system:${key}`,
  key,
  label,
  goal,
  description,
  isSystem: true,
}));

/** Display label for a stored pillar value (key → label; legacy free text passes through). */
export function pillarLabel(value: string, library: ContentPillar[] = SYSTEM_CONTENT_PILLARS): string {
  return library.find((p) => p.key === value)?.label ?? value;
}

export function customPillarKey(label: string): string {
  let hash = 0;
  for (const ch of label) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return `custom_${hash.toString(36)}`;
}
