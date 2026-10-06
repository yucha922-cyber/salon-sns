/**
 * Industry presets. These are suggestions only — Brand Brain stores any
 * key/label pair, so new verticals (restaurant, clinic, real_estate, ...)
 * work without code or schema changes. `aiGuide` is optional per-industry
 * guidance appended to every AI prompt.
 */
export interface IndustryPreset {
  key: string;
  label: string;
  group: "beauty_wellness" | "food" | "medical" | "other";
  aiGuide: string;
}

const HEALTH_CLAIMS_GUIDE =
  "施術効果を断定・保証する表現（「必ず治る」「100%改善」等）や医療行為と誤認される表現は避け、体験・感じ方として伝える。";

export const INDUSTRY_PRESETS: IndustryPreset[] = [
  { key: "seitai", label: "整体", group: "beauty_wellness", aiGuide: HEALTH_CLAIMS_GUIDE },
  { key: "biyou_seitai", label: "美容整体", group: "beauty_wellness", aiGuide: HEALTH_CLAIMS_GUIDE },
  { key: "esthetic", label: "エステ", group: "beauty_wellness", aiGuide: "美容効果の誇張表現を避け、体験価値と安心感を伝える。" },
  { key: "hair_salon", label: "美容室", group: "beauty_wellness", aiGuide: "スタイル・季節性・スタイリストの個性を活かす。" },
  { key: "nail", label: "ネイル", group: "beauty_wellness", aiGuide: "デザイン写真映えと季節のトレンドを重視する。" },
  { key: "eyelash", label: "アイラッシュ", group: "beauty_wellness", aiGuide: "仕上がりの自然さと安全性・衛生面を伝える。" },
  { key: "personal_gym", label: "パーソナルジム", group: "beauty_wellness", aiGuide: "短期間での劇的な変化を保証する表現は避ける。" },
  { key: "restaurant", label: "飲食店", group: "food", aiGuide: "メニューのシズル感、来店シーン、予約導線を重視する。" },
  { key: "clinic", label: "クリニック", group: "medical", aiGuide: "医療広告ガイドラインに配慮し、ビフォーアフターや効果の断定を避ける。" },
  { key: "real_estate", label: "不動産", group: "other", aiGuide: "物件情報の正確性と表示規約に配慮する。" },
];

export const CUSTOM_INDUSTRY_KEY = "custom";

export function findIndustryPreset(key: string): IndustryPreset | undefined {
  return INDUSTRY_PRESETS.find((p) => p.key === key);
}
