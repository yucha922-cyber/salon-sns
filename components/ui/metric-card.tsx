import type { MetricSummary } from "@/lib/domain/types";

export function MetricCard({ metric, note }: { metric: MetricSummary; note?: string }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        {metric.label}
        <span className="metric-glyph">{metric.glyph}</span>
      </div>
      <div className="metric-value">{metric.value}</div>
      <div className="metric-foot">
        {metric.change ? (
          <>
            <span className={metric.positive ? "positive" : "negative"}>{metric.change}</span> 前月比
          </>
        ) : (
          <span>{note ?? " "}</span>
        )}
      </div>
    </div>
  );
}
