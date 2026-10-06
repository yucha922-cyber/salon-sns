"use client";

import { useState, useTransition } from "react";
import type { Recommendation } from "@/lib/domain/types";
import { analyzeAdsAction } from "@/app/actions/ai";
import type { AdAnalysis } from "@/lib/ai/schemas";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const IMPACT = { low: "影響度 低", medium: "影響度 中", high: "影響度 高" } as const;

export function AnalysisView({ recommendations, canAnalyze }: { recommendations: Recommendation[]; canAnalyze: boolean }) {
  const toast = useToast();
  const [insights, setInsights] = useState<AdAnalysis["insights"] | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const analyze = () =>
    startTransition(async () => {
      const result = await analyzeAdsAction();
      if (!result.ok) return toast(result.error, "error");
      setInsights(result.data.insights);
      toast("Brand Brainと広告データから再分析しました");
    });

  return (
    <>
      {canAnalyze && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button className="button small" onClick={analyze} disabled={pending}>{pending ? <Spinner /> : "✳"} AIで再分析</button>
        </div>
      )}
      <div className="analysis-list">
        {insights
          ? insights.map((i) => (
              <article className="analysis-item" key={i.title}>
                <div className={`analysis-icon ${i.impact === "high" ? "green" : ""}`}>{i.impact === "high" ? "◎" : "↘"}</div>
                <div className="analysis-body">
                  <h3>{i.title}</h3>
                  <p><b>観測：</b>{i.observation}<br /><b>仮説：</b>{i.hypothesis}<br /><b>提案：</b>{i.proposal}</p>
                </div>
                <div className="analysis-metric">{IMPACT[i.impact]}</div>
              </article>
            ))
          : recommendations.map((r) => (
              <article className="analysis-item" key={r.id}>
                <div className={`analysis-icon ${r.tone === "positive" ? "green" : ""}`}>{r.tone === "positive" ? "✧" : "↘"}</div>
                <div className="analysis-body">
                  <h3>{r.title}</h3>
                  <p>{r.body}</p>
                  <small className="activity-note">{r.meta}</small>
                </div>
                <div className="analysis-metric" style={r.tone === "positive" ? { color: "#4d9279" } : undefined}>{r.metric}</div>
              </article>
            ))}
      </div>
      {recommendations.length > 0 && (
        <div className="panel section-spacer">
          <div className="panel-heading">
            <div><div className="panel-title">改善案の承認</div><div className="panel-subtitle">広告設定の変更は、承認後に反映されます</div></div>
            <span className="status-pill review">承認待ち 1件</span>
          </div>
          <div className="recommendation-callout">
            <b>提案：</b>低調な「美容整体 Before/After」の1日予算を¥4,000減らし、「仕事帰りの整体体験」へ¥3,000を配分。残り¥1,000は全体予算から調整します。
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 13 }}>
            <button className="button small" onClick={() => toast("提案を保留にしました")}>保留</button>
            <button className="button small primary" onClick={() => setApproveOpen(true)}>承認して適用</button>
          </div>
        </div>
      )}
      <Modal open={approveOpen} title="改善案を承認" intro="承認内容を記録しました。" onClose={() => setApproveOpen(false)}
        actions={<button className="button primary" onClick={() => setApproveOpen(false)}>確認</button>}>
        <div className="recommendation-callout">
          MVPでは広告APIに接続していないため、広告設定は変更されません。連携後も、実行時に改めて承認を求めます。
        </div>
      </Modal>
    </>
  );
}
