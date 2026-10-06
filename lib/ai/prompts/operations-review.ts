/**
 * AI operations review: turns plan-coverage facts into recommendations that a
 * human approves / rejects. Never claims actions were taken automatically.
 */
import type { BrandBrainInput, RecommendationInput, SnsAccount } from "@/lib/domain/types";
import { goalLabel, PLATFORM_LABELS } from "@/lib/domain/labels";
import type { OperationsOverview } from "@/lib/services/operations";
import type { GenerateObjectRequest } from "../provider";
import { operationsReviewSchema, type OperationsReviewOutput } from "../schemas";
import { brandSystemBlock, SAFETY_RULES } from "./shared";

function facts(o: OperationsOverview): string {
  const lines = [`対象月: ${o.month}`, `実施中の本部キャンペーン: ${o.activeCampaigns.map((c) => c.name).join("、") || "なし"}`];
  for (const loc of o.locations) {
    for (const s of loc.accounts) {
      const a = s.account;
      lines.push(
        `- ${loc.name} / ${PLATFORM_LABELS[a.platform]} ${a.handle} / 目的:${goalLabel(a.goal, a.customGoal)} / ${a.active ? "運用中" : "停止中"} / 今月 予定${s.planned}本・承認済み${s.approved}本・下書き${s.drafts}本 / 目標${s.monthlyTarget}本 / 柱:${a.strategy.contentPillars.length}個 / ペルソナ:${a.strategy.persona ? "あり" : "未設定"}`,
      );
    }
  }
  return lines.join("\n");
}

export function buildOperationsReviewRequest(brain: BrandBrainInput, overview: OperationsOverview): GenerateObjectRequest<OperationsReviewOutput> {
  const { ctx, text } = brandSystemBlock(brain);
  return {
    system: [
      `あなたは「${ctx.brand.name}」本部のSNS運用マネージャーです。複数店舗・複数アカウントの運用状況から、今週やるべき改善を最大5つ提案します。`,
      "- 各提案は observation（事実）→ insight（意味）→ hypothesis（仮説）→ recommendedAction（具体的な次の一手）の順で書く。",
      "- 事実は与えられた運用データのみを根拠にする。数値を創作しない。",
      "- 集客アカウントの課題は category=acquisition、採用アカウントは recruitment、全体設計は strategy にする。",
      "- accountHandle は対象アカウントのID（全体の提案は null）。",
      SAFETY_RULES,
      "",
      text,
    ].join("\n"),
    prompt: `運用データ:\n${facts(overview)}`,
    schema: operationsReviewSchema,
    schemaName: "operations_review",
    maxTokens: 4000,
    mockResponse: () => mockReview(overview),
  };
}

function mockReview(o: OperationsOverview): OperationsReviewOutput {
  const recs: OperationsReviewOutput["recommendations"] = [];
  const statuses = o.locations.flatMap((l) => l.accounts.map((s) => ({ ...s, loc: l.name })));
  for (const s of statuses.filter((x) => x.account.active && x.coverage < 0.5).slice(0, 3)) {
    const a = s.account;
    const recruit = a.goal === "recruitment";
    recs.push({
      accountHandle: a.handle,
      category: recruit ? "recruitment" : a.goal === "acquisition" ? "acquisition" : "social",
      severity: s.planned === 0 ? "high" : "medium",
      title: `${s.loc} ${PLATFORM_LABELS[a.platform]}の今月の投稿計画が不足しています`,
      observation: `今月の予定は${s.planned}本で、戦略上の目標${s.monthlyTarget}本（週${a.strategy.postsPerWeek}本）に届いていません。`,
      insight: recruit ? "採用は接触回数が応募に直結するため、投稿が途切れると候補者の検討が止まります。" : "投稿間隔が空くと、悩み→予約までのファネルが途中で途切れます。",
      hypothesis: recruit ? "「1日の仕事」と「研修」の投稿を増やすと、採用ページクリックが伸びる可能性があります。" : "教育・セルフケア投稿を補うと保存数とプロフィールアクセスが伸びる可能性があります。",
      recommendedAction: "SNS Plannerの「AIで1ヶ月分作成」でこのアカウントの企画案を作り、確認して承認してください。",
      expectedImpact: recruit ? "応募前の接点（DM・採用ページ）の増加" : "予約導線への流入増加",
      confidence: 0.7,
    });
  }
  for (const s of statuses.filter((x) => x.account.active && (!x.account.strategy.persona || x.account.strategy.contentPillars.length < 2)).slice(0, 1)) {
    recs.push({
      accountHandle: s.account.handle,
      category: "strategy",
      severity: "medium",
      title: `${s.account.handle}の運用戦略が未設定です`,
      observation: "ペルソナまたはコンテンツの柱が不足しています。",
      insight: "戦略がないとAIの企画が一般論になり、目的（集客・採用）に沿わなくなります。",
      hypothesis: "AI Account Strategistの提案をベースに戦略を決めると、企画の精度が上がります。",
      recommendedAction: "アカウント戦略画面で「AI Account Strategist」を実行し、内容を確認して適用してください。",
      expectedImpact: "企画の一貫性向上",
      confidence: 0.8,
    });
  }
  const campaign = o.activeCampaigns[0];
  if (campaign) {
    recs.push({
      accountHandle: null,
      category: "strategy",
      severity: "low",
      title: `本部テーマ「${campaign.name}」を各店舗の企画に反映しましょう`,
      observation: `実施中の本部キャンペーンがあります（${campaign.startsOn ?? ""}〜${campaign.endsOn ?? ""}）。`,
      insight: "店舗ごとにローカライズすることで、共通メッセージと地域性を両立できます。",
      hypothesis: "店舗の月間計画を作る際に本部キャンペーンを指定すると、必須メッセージの漏れを防げます。",
      recommendedAction: "SNS Plannerで月間計画を作成する際、本部キャンペーンを選択してください。",
      expectedImpact: "全店舗で一貫したキャンペーン訴求",
      confidence: 0.6,
    });
  }
  return { recommendations: recs.slice(0, 5) };
}

/** Maps AI output to repository inputs (handles → ids, only within the org). */
export function toRecommendationInputs(output: OperationsReviewOutput, accounts: SnsAccount[]): RecommendationInput[] {
  return output.recommendations.map((r) => {
    const account = r.accountHandle ? accounts.find((a) => a.handle === r.accountHandle) ?? null : null;
    return {
      locationId: account?.locationId ?? null,
      socialAccountId: account?.id ?? null,
      category: r.category,
      severity: r.severity,
      title: r.title,
      observation: r.observation,
      insight: r.insight,
      hypothesis: r.hypothesis,
      recommendedAction: r.recommendedAction,
      expectedImpact: r.expectedImpact,
      confidence: r.confidence,
    };
  });
}
