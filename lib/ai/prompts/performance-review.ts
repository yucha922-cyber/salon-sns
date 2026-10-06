/**
 * AI Performance Review: one published post vs. the account's own baseline.
 * Output feeds Marketing Memory (content_learnings) and a recommendation that
 * a human approves. The AI only reads facts we measured; it never invents
 * numbers and never changes the operation by itself.
 */
import type { BrandBrainInput, Post, SnsAccount } from "@/lib/domain/types";
import { CONTENT_TYPE_LABELS, goalLabel, PLATFORM_LABELS } from "@/lib/domain/labels";
import { formatInZone } from "@/lib/domain/timezone";
import { pillarLabel } from "@/lib/brand/content-pillars";
import {
  formatNumber,
  formatPercent,
  formatSignedPercent,
  primaryMetricForGoal,
  RATE_LABELS,
  rates,
  relativeDiff,
  type Baseline,
} from "@/lib/social/metrics";
import type { ContentLearning, MetricSnapshot, PublishablePlatform } from "@/lib/social/types";
import type { GenerateObjectRequest } from "../provider";
import { performanceReviewSchema, type PerformanceReviewOutput } from "../schemas";
import { brandSystemBlock, quoteUserInput, SAFETY_RULES } from "./shared";

export interface PerformanceReviewContext {
  brain: BrandBrainInput;
  post: Post;
  account: SnsAccount;
  locationName: string;
  timezone: string;
  publishedAt: string;
  current: MetricSnapshot;
  checkpoints: { label: string; snapshot: MetricSnapshot | null }[];
  baseline: Baseline;
  memory: ContentLearning[];
}

function metricLine(s: MetricSnapshot): string {
  const m = s.metrics;
  const r = rates(m);
  return [
    m.reach !== undefined && `リーチ ${formatNumber(m.reach)}`,
    m.views !== undefined && `閲覧 ${formatNumber(m.views)}`,
    m.likes !== undefined && `いいね ${formatNumber(m.likes)}`,
    m.comments !== undefined && `コメント ${formatNumber(m.comments)}`,
    m.saves !== undefined && `保存 ${formatNumber(m.saves)}`,
    m.shares !== undefined && `シェア ${formatNumber(m.shares)}`,
    m.profileVisits !== undefined && `プロフィール ${formatNumber(m.profileVisits)}`,
    m.follows !== undefined && `フォロー ${formatNumber(m.follows)}`,
    r.saveRate !== undefined && `保存率 ${formatPercent(r.saveRate)}`,
    r.engagementRate !== undefined && `ER ${formatPercent(r.engagementRate)}`,
  ]
    .filter(Boolean)
    .join(" / ");
}

function facts(c: PerformanceReviewContext): string {
  const p = c.post;
  const lines = [
    `店舗: ${c.locationName}`,
    `アカウント: ${PLATFORM_LABELS[c.account.platform]} ${c.account.handle}（目的: ${goalLabel(c.account.goal, c.account.customGoal)}）`,
    `投稿タイプ: ${CONTENT_TYPE_LABELS[p.contentType]} / コンテンツの柱: ${p.planning.contentPillar ? pillarLabel(p.planning.contentPillar) : "未設定"} / ファネル: ${p.planning.funnelStage || "未設定"}`,
    `投稿日時: ${formatInZone(c.publishedAt, c.timezone)}`,
    `経過時間: ${Math.round(c.current.hoursSincePublish ?? 0)}時間`,
    `現在の指標: ${metricLine(c.current)}`,
    ...c.checkpoints.map((cp) => `${cp.label}: ${cp.snapshot ? metricLine(cp.snapshot) : "未取得"}`),
    `アカウント平均（中央値・過去${c.baseline.sampleSize}投稿）: リーチ ${formatNumber(c.baseline.reach)} / 閲覧 ${formatNumber(c.baseline.views)} / 保存率 ${formatPercent(c.baseline.saveRate)} / ER ${formatPercent(c.baseline.engagementRate)} / プロフィール遷移率 ${formatPercent(c.baseline.profileVisitRate)}`,
  ];
  if (c.memory.length) lines.push("既存のMarketing Memory:", ...c.memory.slice(0, 5).map((l) => `- ${l.learning}（確度${l.confidence}）`));
  return lines.join("\n");
}

export function buildPerformanceReviewRequest(c: PerformanceReviewContext): GenerateObjectRequest<PerformanceReviewOutput> {
  const { ctx, text } = brandSystemBlock(c.brain);
  const primary = primaryMetricForGoal(c.account.goal, c.account.platform as PublishablePlatform);
  return {
    system: [
      `あなたは「${ctx.brand.name}」のSNSアナリストです。公開済みの投稿1本の成果を、同じアカウントの過去平均と比較して振り返ります。`,
      `- 評価軸は目的によって変える：集客＝保存率・プロフィールアクセス・リンククリック、採用＝プロフィール遷移・採用ページクリック、ブランド＝リーチ・閲覧・ER。この投稿の主要指標は「${RATE_LABELS[primary]}」。`,
      "- 与えられた数値だけを根拠にする。差は「過去平均より◯%高い/低い」と具体的に書く。DM・予約・応募はAPIで取得していないので断定しない。",
      "- 比較対象が3投稿未満なら confidence を0.5以下にし、learning は「仮説」として書く。",
      "- learning は次の企画に使える一文（例：渋谷院Instagramでは肩こりHow-to Reelの保存率がBefore/Afterより高い）。学びがない場合は null。",
      "- recommendation は人が承認する前提の具体的な次の一手（例：来週のReel4本中2本をHow-to型にする）。不要なら null。",
      SAFETY_RULES,
      "",
      text,
    ].join("\n"),
    prompt: [`投稿データ:\n${facts(c)}`, quoteUserInput("post_caption", c.post.caption.slice(0, 1200)), quoteUserInput("post_title", c.post.title)].join("\n\n"),
    schema: performanceReviewSchema,
    schemaName: "performance_review",
    maxTokens: 2500,
    mockResponse: () => mockPerformanceReview(c),
  };
}

export function mockPerformanceReview(c: PerformanceReviewContext): PerformanceReviewOutput {
  const platform = c.account.platform as PublishablePlatform;
  const primary = primaryMetricForGoal(c.account.goal, platform);
  const label = RATE_LABELS[primary];
  const value = rates(c.current.metrics)[primary];
  const base = c.baseline[primary];
  const diff = relativeDiff(value, base);
  const pillar = c.post.planning.contentPillar ? pillarLabel(c.post.planning.contentPillar) : c.post.planning.theme || CONTENT_TYPE_LABELS[c.post.contentType];
  const typeLabel = CONTENT_TYPE_LABELS[c.post.contentType];
  const where = `${c.locationName}の${PLATFORM_LABELS[c.account.platform]}`;
  const thin = c.baseline.sampleSize < 3 || diff === undefined;
  const reachDiff = relativeDiff(c.current.metrics.reach ?? c.current.metrics.views, c.baseline.reach ?? c.baseline.views);
  const confidence = thin ? 0.45 : Math.min(0.85, 0.55 + c.baseline.sampleSize * 0.03);
  const up = diff !== undefined && diff >= 0.15;
  const down = diff !== undefined && diff <= -0.15;

  const summary = thin
    ? `${label}は${formatPercent(value)}でした。比較できる過去投稿が${c.baseline.sampleSize}本のため、評価は参考値です。`
    : `${label}は${formatPercent(value)}で、アカウント平均（${formatPercent(base)}）より${formatSignedPercent(diff)}。リーチは平均比${formatSignedPercent(reachDiff)}でした。`;
  const learning = thin
    ? null
    : up || down
      ? {
          learning: `${where}では「${pillar}」（${typeLabel}）の${label}が過去平均より${Math.abs(Math.round((diff ?? 0) * 100))}%${up ? "高い" : "低い"}`,
          hypothesis: up ? `${c.brain.targetAudience.summary || "ターゲット"}は「${pillar}」型の情報に反応しやすい` : `「${pillar}」は冒頭のフックが弱く、${label}につながりにくい`,
          result: `${label} ${formatPercent(value)}（平均 ${formatPercent(base)}）`,
          contentPillar: c.post.planning.contentPillar,
        }
      : null;
  const recommendation =
    !thin && up && (diff ?? 0) >= 0.2
      ? {
          severity: "medium" as const,
          title: `${where}：「${pillar}」型の投稿を増やしましょう`,
          observation: `「${c.post.title}」の${label}が過去平均より${formatSignedPercent(diff)}でした（${formatPercent(value)} vs ${formatPercent(base)}）。`,
          insight: up && primary === "saveRate" ? "保存される＝後で見返したい教育コンテンツとして評価されています。" : "このテーマへの関心が高いことを示しています。",
          hypothesis: `${c.brain.targetAudience.summary || "ターゲット"}は来店訴求より、「${pillar}」を入口にした方が反応する可能性があります。`,
          recommendedAction: `来週の${typeLabel}のうち2本を「${pillar}」型にする（SNS Plannerで企画を作成し、承認してから予約）。`,
          expectedImpact: `${label} +15〜25%`,
          confidence,
        }
      : !thin && down && (diff ?? 0) <= -0.25
        ? {
            severity: "medium" as const,
            title: `${where}：「${pillar}」の${label}が低下しています`,
            observation: `「${c.post.title}」の${label}が過去平均より${formatSignedPercent(diff)}でした。`,
            insight: "冒頭3秒・1枚目で「自分ごと」と感じてもらえていない可能性があります。",
            hypothesis: "悩みの言語化（例：〇〇な人のNG習慣）から始めると反応が戻る可能性があります。",
            recommendedAction: "次回の同テーマ投稿は、フックを悩み訴求に変えてA/B比較する。",
            expectedImpact: `${label}を平均水準まで回復`,
            confidence: Math.min(confidence, 0.7),
          }
        : null;
  return {
    summary,
    whatWorked: up ? [`${label}が平均より${formatSignedPercent(diff)}`, ...(reachDiff !== undefined && reachDiff > 0.1 ? [`リーチも平均比${formatSignedPercent(reachDiff)}`] : [])] : [],
    whatDidNotWork: down ? [`${label}が平均より${formatSignedPercent(diff)}`] : reachDiff !== undefined && reachDiff < -0.2 ? [`リーチが平均比${formatSignedPercent(reachDiff)}`] : [],
    possibleReasons: up
      ? ["保存したくなる具体的なHow-to・チェックリスト形式", `ターゲットの悩み（${c.brain.targetAudience.painPoints[0] ?? "主な悩み"}）に直接触れている`]
      : down
        ? ["1枚目・冒頭のフックが弱い可能性", `投稿時間（${formatInZone(c.publishedAt, c.timezone)}）がターゲットの閲覧時間とずれている可能性`]
        : ["平均的な反応。テーマ・フォーマットを変えたA/B比較で差を検証しましょう"],
    keyLearning: learning?.learning ?? "比較データが少ないため、同じ柱の投稿をあと数本重ねて傾向を確認します。",
    recommendedNextAction: recommendation?.recommendedAction ?? "同じ柱で別のフックの投稿を作り、反応を比較する。",
    nextCreativeHypothesis: up ? `「${pillar}」×${typeLabel}は保存・プロフィール遷移につながる` : `悩み訴求のフックに変えると${label}が改善する`,
    confidence,
    learning,
    recommendation: recommendation ? { ...recommendation, confidence: Math.round(recommendation.confidence * 100) / 100 } : null,
  };
}

export function recommendationCategoryFor(goal: SnsAccount["goal"]): "acquisition" | "recruitment" | "social" {
  return goal === "recruitment" ? "recruitment" : goal === "acquisition" ? "acquisition" : "social";
}
