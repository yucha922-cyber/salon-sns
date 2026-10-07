/**
 * Creative Brief + variant generation input/output and the deterministic
 * generator used when no AI key is configured (Demo Mode / tests).
 * 1 test = 1 variable: challengers change ONLY the hypothesis variable and
 * keep everything else equal to the control so the result is attributable.
 */
import { ANGLE_LABELS, VARIABLE_LABELS } from "./creative-memory";
import { similarity } from "./policy";
import type { AdGoal, CreativeAngle, CreativeBrief, TestVariable, VideoScript } from "./types";

export interface CreativeGenInput {
  brandName: string;
  locationName: string;
  goal: AdGoal;
  persona: string;
  painPoint: string;
  problem: string;
  hypothesis: string;
  variable: TestVariable;
  control: { headline: string; primaryText: string; hook: string; angle: string; cta: string; visualDirection: string; format: string | null };
  angles: [CreativeAngle, CreativeAngle];
  principles: { principle: string; scenes: string[] }[];
  /** hooks already used in this campaign (never repeat them) */
  avoidHooks: string[];
  strengths: string[];
  brandTone: string;
  offer: string;
  /** "regenerate" counter so a second run produces different copy */
  seed: number;
}

export interface GeneratedVariant {
  label: "B" | "C";
  angle: CreativeAngle;
  hook: string;
  headline: string;
  primaryText: string;
  cta: string;
  firstViewCopy: string;
  visualDirection: string;
  videoScript: VideoScript;
  rationale: string;
}

export interface GeneratedCreativeSet {
  brief: CreativeBrief;
  variants: GeneratedVariant[];
}

const bodyWord = (pain: string) => (/腰/.test(pain) ? "腰" : /肩|首/.test(pain) ? "首肩" : /産後|骨盤/.test(pain) ? "骨盤まわり" : pain || "体");

const ACQ_SCENES = ["PC作業8時間後", "定時後の30分", "帰りの電車で", "会議が続いた日", "夕方17時", "残業続きの水曜日"];
const REC_SCENES = ["入社2年目の1日", "未経験から1年後", "初めて指名をもらった日", "店長の朝礼", "研修最終日"];

function acquisitionCopy(angle: CreativeAngle, i: CreativeGenInput, scene: string): { hook: string; headline: string; lead: string } {
  const b = bodyWord(i.painPoint);
  const strength = i.strengths[0] ?? "姿勢分析";
  const table: Record<string, { hook: string; headline: string; lead: string }> = {
    lifestyle: { hook: `${scene}の${b}、そのままにしない`, headline: `${scene}の${b}を、帰り道でリセット`, lead: `${scene}。${b}がずっしり重くなる時間帯こそ、ケアのタイミングです。` },
    problem: { hook: `${b}のこわばり、揉むだけで終わらせない`, headline: `揉むだけで終わらせない${b}ケア`, lead: `その場は楽でも、また戻る。${b}のこわばりは姿勢のクセから見直せます。` },
    expertise: { hook: `${b}が重くなる理由を、${strength}で見える化`, headline: `${strength}で、${b}の原因から整える`, lead: `国家資格者が${strength}の結果をもとに、原因に合わせて施術します。` },
    myth_busting: { hook: `揉んでも戻る${b}。原因は姿勢のクセかもしれません`, headline: `「揉めば楽になる」の、その先へ`, lead: `マッサージで一時的に楽になっても戻るのは、座り方や姿勢のクセが残っているから。` },
    how_to: { hook: `デスクでできる${b}ケアと、プロに任せること`, headline: `自分でできるケア＋プロの姿勢ケア`, lead: `毎日のセルフケアと、月1回のプロのケア。続けやすい組み合わせをご提案します。` },
    desire: { hook: `軽い${b}で、夜の時間をもっと自由に`, headline: `仕事のあとも、軽い体で`, lead: `夕方の重さがなくなると、仕事のあとの時間がもっと楽しくなります。` },
    social_proof: { hook: `仕事帰りに通う会社員が多い姿勢ケア`, headline: `仕事帰りに通いやすい姿勢ケア`, lead: `駅から近く、夜まで営業。仕事帰りに通いやすい理由があります。（お客様の声は許諾済みのものだけを使用）` },
    before_after: { hook: `座り姿勢、ケアの前と後で比べると`, headline: `姿勢のシルエットで見る変化`, lead: `姿勢分析で、ケア前後の姿勢の違いを一緒に確認します（個人差があります）。` },
    offer: { hook: `初回は${strength}つきのカウンセリングから`, headline: `初回カウンセリング受付中`, lead: `まずは${strength}とカウンセリングから。無理な勧誘はしません。` },
    identity: { hook: `デスクワーカーのための姿勢ケア`, headline: `デスクワークの毎日に合わせた姿勢ケア`, lead: `座る時間が長い毎日に合わせて、ケアとセルフケアを組み立てます。` },
    comparison: { hook: `マッサージと姿勢ケア、何が違う？`, headline: `マッサージとの違い、説明します`, lead: `ほぐすだけでなく、姿勢のクセから整えるのが姿勢ケアです。` },
    urgency: { hook: `今月の初回カウンセリング、受付中`, headline: `今月の初回カウンセリング受付中`, lead: `ご予約はWebから24時間受け付けています。` },
  };
  return table[angle] ?? (table.lifestyle as { hook: string; headline: string; lead: string });
}

function recruitmentCopy(angle: CreativeAngle, i: CreativeGenInput, scene: string): { hook: string; headline: string; lead: string } {
  const table: Record<string, { hook: string; headline: string; lead: string }> = {
    employee_story: { hook: `${scene}を、本人が語ります`, headline: `${i.brandName}セラピストの${scene}`, lead: `${scene}のリアルを、働くスタッフ本人の言葉で紹介します。` },
    career: { hook: `セラピストの先に、店長・トレーナーという道`, headline: `技術を磨いた先のキャリアも描ける`, lead: `施術者として成長したあと、店長や教育担当へ。キャリアの選択肢を説明会でお伝えします。` },
    culture: { hook: `技術をチームで磨く職場です`, headline: `ひとりで抱えこまないチーム`, lead: `朝のミーティングや症例共有で、チームで技術を高めています。` },
    training: { hook: `研修カリキュラムで、基礎から学べる`, headline: `基礎から学べる研修制度`, lead: `解剖学の基礎から実技まで、段階的に学べる研修を用意しています。` },
    salary: { hook: `給与・休日・手当、はっきり書きます`, headline: `待遇は求人ページで全部公開`, lead: `給与・休日・資格手当などの条件を、求人ページですべて公開しています。` },
    global_opportunity: { hook: `日本の姿勢ケアを、海外へ`, headline: `海外展開に関われるチャンス`, lead: `海外展開に関心のある方は、説明会で詳しくお話しします。` },
  };
  return table[angle] ?? (table.employee_story as { hook: string; headline: string; lead: string });
}

function script(hook: string, visual: string, cta: string, goal: AdGoal): VideoScript {
  return {
    hook,
    scenes: [
      { seconds: "0-2", visual, onScreenText: hook, narration: "" },
      { seconds: "2-6", visual: goal === "recruitment" ? "スタッフの仕事風景（実際のスタッフ・許諾済み）" : "日常シーン（PC作業・帰り道）", onScreenText: goal === "recruitment" ? "どんな人が、どう働いているか" : "夕方になると重くなる", narration: "" },
      { seconds: "6-12", visual: goal === "recruitment" ? "研修・ミーティングの様子" : "姿勢分析・カウンセリングの様子", onScreenText: goal === "recruitment" ? "チームで成長できる環境" : "原因から整える", narration: "" },
      { seconds: "12-15", visual: "ロゴと店舗外観", onScreenText: cta, narration: "" },
    ],
  };
}

const VISUAL_BY_ANGLE: Partial<Record<CreativeAngle, string>> = {
  problem: "首や肩に手を当てる横顔（表情は誇張しない）→ 施術者の手元。テロップで冒頭のHookを表示。",
  expertise: "姿勢分析の画面と、結果を説明する施術者。清潔感のある個室。",
  myth_busting: "「揉む」と「整える」の違いを2カットで対比（イラスト可）。",
  how_to: "デスクでできるストレッチを1つ実演 → プロのケアへ。",
  social_proof: "仕事帰りに来院するシーン（モデル使用・お客様の声は許諾済みのみ）。",
  before_after: "姿勢シルエットの比較（体型・肌の比較はしない）。",
  culture: "朝ミーティング・症例共有の様子（実際のスタッフ・許諾済み）。",
  training: "研修での実技練習の手元と講師。",
  career: "店長・トレーナーとして働くスタッフのポートレート。",
  salary: "求人ページの条件を大きなテロップで（数値は求人票と一致させる）。",
};

const CTA_ALTERNATIVES: Record<string, string> = { BOOK_NOW: "LEARN_MORE", LEARN_MORE: "BOOK_NOW", APPLY_NOW: "LEARN_MORE", SIGN_UP: "BOOK_NOW" };

export function mockCreativeSet(i: CreativeGenInput): GeneratedCreativeSet {
  const pool = [...i.principles.flatMap((p) => p.scenes), ...(i.goal === "recruitment" ? REC_SCENES : ACQ_SCENES)];
  const fresh = pool.filter((s, idx) => pool.indexOf(s) === idx && !i.avoidHooks.some((h) => h.includes(s)));
  const scenes = fresh.length ? fresh : pool;
  const pick = (n: number) => scenes[(n + i.seed * 2) % scenes.length] as string;
  const copyChanges = ["hook", "problem_angle", "expertise_angle", "persona", "before_after", "social_proof"].includes(i.variable);

  const variants: GeneratedVariant[] = (["B", "C"] as const).map((label, n) => {
    const angle = i.angles[n] as CreativeAngle;
    let copy = (i.goal === "recruitment" ? recruitmentCopy : acquisitionCopy)(angle, i, pick(n));
    // Never ship a near-duplicate of an existing hook.
    if (i.avoidHooks.some((h) => similarity(h, copy.hook) > 0.6)) copy = (i.goal === "recruitment" ? recruitmentCopy : acquisitionCopy)(angle, i, pick(n + 1));
    const base = { headline: i.control.headline, primaryText: i.control.primaryText, hook: i.control.hook, cta: i.control.cta, visual: i.control.visualDirection || "現行Creativeと同じビジュアル" };
    const v = { ...base };
    if (copyChanges) {
      v.hook = copy.hook;
      v.headline = copy.headline;
      v.primaryText = `${copy.lead}${i.goal === "recruitment" ? "まずはカジュアルな説明会から。" : `${i.locationName}、仕事帰りにも通いやすい立地です。`}`;
    } else if (i.variable === "visual" || i.variable === "format") {
      v.visual = n === 0 ? `${pick(0)}の場面を切り取った実写（人物は横顔・誇張なし）` : "店内・スタッフの手元を中心にした清潔感のある写真";
    } else if (i.variable === "cta") {
      v.cta = CTA_ALTERNATIVES[i.control.cta] ?? "LEARN_MORE";
    } else if (i.variable === "offer" || i.variable === "price") {
      v.primaryText = `${i.control.primaryText}\n${n === 0 ? `初回は${i.strengths[0] ?? "カウンセリング"}つき。` : i.offer || "初回カウンセリング受付中。"}`;
    }
    const firstView = v.hook.length > 18 ? `${v.hook.slice(0, 18)}…` : v.hook;
    const visualDirection =
      i.variable === "visual" || i.variable === "format"
        ? v.visual
        : (VISUAL_BY_ANGLE[angle] ??
          (i.goal === "recruitment"
            ? `${pick(n)}の実際のスタッフ（許諾済み）を自然光で。テロップは大きく1行。`
            : `${pick(n)}を想起させる実写（デスク・時計・帰り道）。人物は横顔・誇張なし。テロップで冒頭のHookを表示。`));
    return {
      label,
      angle,
      hook: v.hook,
      headline: v.headline,
      primaryText: v.primaryText,
      cta: v.cta,
      firstViewCopy: firstView,
      visualDirection,
      videoScript: script(v.hook, visualDirection, i.goal === "recruitment" ? "まずは説明会へ" : "Webで予約", i.goal),
      rationale:
        n === 0
          ? `${VARIABLE_LABELS[i.variable]}だけを変更。${i.principles[0] ? `Creative Memoryの原則「${i.principles[0].principle}」を新しい場面（${pick(n)}）で表現。` : `仮説「${i.hypothesis.slice(0, 40)}」を検証。`}`
          : `${ANGLE_LABELS[angle]}の切り口で、まだ試していない角度を検証（${VARIABLE_LABELS[i.variable]}のみ変更）。`,
    };
  });

  const b = variants[0] as GeneratedVariant;
  const brief: CreativeBrief = {
    goal: i.goal === "recruitment" ? "応募獲得（応募単価の改善）" : "予約獲得（CPAの改善）",
    persona: i.persona,
    painPoint: i.painPoint,
    coreMessage: i.goal === "recruitment" ? "どんな人が、どう成長できる職場かを具体的に伝える" : `${bodyWord(i.painPoint)}の重さを、原因（姿勢）から整える`,
    hook: b.hook,
    angle: b.angle,
    proof: i.strengths.slice(0, 2).join(" / ") || "Brand Brainの強み",
    cta: b.cta,
    visualDirection: b.visualDirection,
    sceneStructure: b.videoScript.scenes.map((s) => `${s.seconds}秒: ${s.onScreenText}`),
    requiredAssets: i.goal === "recruitment" ? ["スタッフの実写（掲載許諾）", "研修・ミーティング風景", "ロゴ"] : ["院内・施術風景の実写", "姿勢分析画面のキャプチャ", "ロゴ・店舗外観"],
    forbiddenExpressions: ["治る・治療・完治など医療的効果の断定", "「その肩こり」「○○に悩むあなたへ」等の個人属性の断定", "実在しない口コミ・数値", ...(i.goal === "recruitment" ? ["性別・年齢の限定"] : [])],
    brandTone: i.brandTone,
    policyNotes: [
      "Metaの個人属性ポリシー: 見る人の健康状態・属性を断定/示唆しない",
      "健康・ウェルネス: 効果の保証やBefore/Afterの誇張をしない",
      ...(i.goal === "recruitment" ? ["EMPLOYMENT特別カテゴリ: 年齢・性別などで対象を限定しない"] : []),
    ],
  };
  return { brief, variants };
}
