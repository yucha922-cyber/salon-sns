"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Recommendation, RecommendationStatus } from "@/lib/domain/types";
import { RECOMMENDATION_CATEGORY_LABELS, RECOMMENDATION_STATUS_LABELS, SEVERITY_LABELS } from "@/lib/domain/labels";
import { generateRecommendationsAction, setRecommendationStatusAction } from "@/app/actions/planning";
import { EmptyState, Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

/** AI proposes → a human approves / rejects → marks completed. Nothing runs automatically. */
export function RecommendationList({
  recommendations,
  accountLabels,
  readOnly,
  compact,
  limit,
}: {
  recommendations: Recommendation[];
  accountLabels: Record<string, string>;
  readOnly: boolean;
  compact?: boolean;
  limit?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<RecommendationStatus | "all">("pending");
  const [pending, startTransition] = useTransition();
  const visible = recommendations.filter((r) => filter === "all" || r.status === filter).slice(0, limit ?? 50);

  const setStatus = (id: string, status: RecommendationStatus) =>
    startTransition(async () => {
      const result = await setRecommendationStatusAction({ id, status });
      if (!result.ok) return toast(result.error, "error");
      toast(`「${result.data.title.slice(0, 20)}…」を${RECOMMENDATION_STATUS_LABELS[status]}にしました${status === "approved" && result.data.socialAccountId ? "（SNS Plannerに下書きを追加）" : ""}`);
      router.refresh();
    });

  const generate = () =>
    startTransition(async () => {
      const result = await generateRecommendationsAction();
      if (!result.ok) return toast(result.error, "error");
      toast(result.data.length ? `${result.data.length}件の提案を作成しました` : "新しい提案はありませんでした");
      setFilter("pending");
      router.refresh();
    });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
        {!compact && (
          <div className="tabs" style={{ marginBottom: 0, flex: 1 }} role="tablist">
            {(["pending", "approved", "completed", "rejected", "all"] as const).map((s) => (
              <button key={s} role="tab" aria-selected={filter === s} className={`tab ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>
                {s === "all" ? "すべて" : RECOMMENDATION_STATUS_LABELS[s]} <span>{s === "all" ? recommendations.length : recommendations.filter((r) => r.status === s).length}</span>
              </button>
            ))}
          </div>
        )}
        {!readOnly && (
          <button className="button small soft" style={{ marginLeft: "auto" }} onClick={generate} disabled={pending}>
            {pending ? <Spinner /> : "✳"} AIで運用レビュー
          </button>
        )}
      </div>
      {visible.length === 0 ? (
        <EmptyState icon="◉" title={filter === "pending" ? "承認待ちの提案はありません" : "該当する提案はありません"}
          description="「AIで運用レビュー」を押すと、アカウント戦略と投稿計画の状況からAIが改善案を作ります。" />
      ) : (
        visible.map((r) => (
          <div className="rec-item" key={r.id}>
            <div>
              <h4>
                <span className={`sev ${r.severity}`}>重要度 {SEVERITY_LABELS[r.severity]}</span>
                <span className="loc-pill" style={{ marginRight: 5 }}>{RECOMMENDATION_CATEGORY_LABELS[r.category]}</span>
                {r.source === "performance" && <span className="loc-pill" style={{ marginRight: 5 }} title="Instagram / Threads の実績データ（Insights）から作成">実績データ</span>}
                {r.source === "ads" && <span className="loc-pill" style={{ marginRight: 5 }} title="Meta広告のInsightsから作成">広告データ</span>}
                {r.title}
              </h4>
              {!compact && (
                <p>
                  <b>観測：</b>{r.observation}<br />
                  {r.insight && <><b>示唆：</b>{r.insight}<br /></>}
                  <b>仮説：</b>{r.hypothesis}<br />
                  <b>推奨アクション：</b>{r.recommendedAction}
                </p>
              )}
              {compact && <p>{r.recommendedAction}</p>}
              <p className="activity-note" style={{ marginTop: 4 }}>
                {r.socialAccountId ? `${accountLabels[r.socialAccountId] ?? "アカウント"} · ` : "全体 · "}期待効果：{r.expectedImpact || "—"} · 確信度 {Math.round(r.confidence * 100)}% · {RECOMMENDATION_STATUS_LABELS[r.status]}
              </p>
            </div>
            {!readOnly && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {r.source === "ads" && typeof r.payload?.hypothesisId === "string" && r.payload?.variable && r.payload.variable !== "landing_page" && r.status !== "rejected" && (
                  <Link className="button small primary" href={`/studio?hypothesis=${r.payload.hypothesisId}`}>✧ Creative案を作る</Link>
                )}
                {r.status === "pending" && (
                  <>
                    <button className="button small primary" onClick={() => setStatus(r.id, "approved")} disabled={pending} aria-label={`${r.title}を承認`} title={r.socialAccountId ? "承認するとSNS Plannerに下書きとして追加されます" : undefined}>
                      {r.socialAccountId ? "承認してPlannerへ" : "承認"}
                    </button>
                    <button className="button small" onClick={() => setStatus(r.id, "rejected")} disabled={pending} aria-label={`${r.title}を却下`}>却下</button>
                  </>
                )}
                {r.status === "approved" && (
                  <button className="button small soft" onClick={() => setStatus(r.id, "completed")} disabled={pending}>完了にする</button>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
