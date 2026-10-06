"use client";

import { useState, useTransition } from "react";
import { analyzeAdsAction } from "@/app/actions/ai";
import type { AdAnalysis } from "@/lib/ai/schemas";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const IMPACT = { low: "影響度 低", medium: "影響度 中", high: "影響度 高" } as const;

/** Read-only ad analysis (demo ad data). Changes to ads are never applied automatically. */
export function AdAnalysisPanel() {
  const toast = useToast();
  const [insights, setInsights] = useState<AdAnalysis["insights"] | null>(null);
  const [pending, startTransition] = useTransition();
  const analyze = () =>
    startTransition(async () => {
      const result = await analyzeAdsAction();
      if (!result.ok) return toast(result.error, "error");
      setInsights(result.data.insights);
    });
  return (
    <div className="panel section-spacer">
      <div className="panel-heading">
        <div><div className="panel-title">広告データのAI分析</div><div className="panel-subtitle">デモの広告データから観測→仮説→提案をつくります（広告設定は変更しません）</div></div>
        <button className="button small" onClick={analyze} disabled={pending}>{pending ? <Spinner /> : "✳"} 広告を分析</button>
      </div>
      {insights ? (
        <div className="analysis-list">
          {insights.map((i) => (
            <article className="analysis-item" key={i.title}>
              <div className={`analysis-icon ${i.impact === "high" ? "green" : ""}`}>{i.impact === "high" ? "◎" : "↘"}</div>
              <div className="analysis-body">
                <h3>{i.title}</h3>
                <p><b>観測：</b>{i.observation}<br /><b>仮説：</b>{i.hypothesis}<br /><b>提案：</b>{i.proposal}</p>
              </div>
              <div className="analysis-metric">{IMPACT[i.impact]}</div>
            </article>
          ))}
        </div>
      ) : (
        <p className="activity-note">「広告を分析」を押すと結果が表示されます。</p>
      )}
    </div>
  );
}
