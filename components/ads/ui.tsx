import Link from "next/link";
import { ANGLE_LABELS, VARIABLE_LABELS } from "@/lib/ads/creative-memory";
import { fmtNum, fmtPct, fmtYen } from "@/lib/ads/metrics";
import type { AdFinding, CreativeAngle, TestVariable } from "@/lib/ads/types";
import type { Kpi } from "@/lib/ads/views";

const TABS = [
  { href: "/ads", label: "ダッシュボード" },
  { href: "/ads/creatives", label: "Creative比較" },
  { href: "/ads/experiments", label: "A/Bテスト" },
  { href: "/ads/conversions", label: "自社計測CV" },
  { href: "/ads/connect", label: "接続・キャンペーン設定" },
];

export function AdsTabs({ current }: { current: string }) {
  return (
    <nav className="tabs" aria-label="広告メニュー">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={`tab ${current === t.href ? "active" : ""}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function GoalTabs({ base, goal, extra = "" }: { base: string; goal: string; extra?: string }) {
  const items = [
    { key: "all", label: "すべて" },
    { key: "acquisition", label: "集客（予約）" },
    { key: "recruitment", label: "採用（応募）" },
  ];
  return (
    <div className="view-toggle" role="tablist" aria-label="目的">
      {items.map((i) => (
        <Link key={i.key} role="tab" aria-selected={goal === i.key} className={`button small ${goal === i.key ? "soft" : ""}`} style={{ border: 0, borderRadius: 0 }} href={`${base}?goal=${i.key}${extra}`}>
          {i.label}
        </Link>
      ))}
    </div>
  );
}

export function formatValue(v: number | null, format: Kpi["format"], currency = "JPY"): string {
  if (v === null || Number.isNaN(v)) return "—";
  if (format === "yen") return fmtYen(v, currency);
  if (format === "pct") return fmtPct(v);
  if (format === "ratio") return `${v.toFixed(2)}x`;
  return fmtNum(v);
}

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const good = kpi.change === null ? null : kpi.higherIsBetter ? kpi.change >= 0 : kpi.change <= 0;
  return (
    <div className="metric-card">
      <div className="metric-top">
        {kpi.label}
        {kpi.note && <span className="loc-pill">{kpi.note}</span>}
      </div>
      <div className="metric-value">{formatValue(kpi.value, kpi.format)}</div>
      <div className="metric-foot">
        {kpi.change === null ? (
          <span>前7日比 —</span>
        ) : (
          <>
            <span className={good ? "positive" : "negative"}>
              {kpi.change >= 0 ? "+" : ""}
              {Math.round(kpi.change * 100)}%
            </span>{" "}
            前7日比（{formatValue(kpi.previous, kpi.format)}）
          </>
        )}
      </div>
    </div>
  );
}

const KIND_ICON: Record<AdFinding["kind"], string> = {
  creative_fatigue: "↻",
  ctr_drop: "↘",
  lp_cvr_drop: "⇣",
  cpa_spike: "¥",
  cpc_rise: "↗",
  frequency_high: "↻",
  underdelivery: "◔",
  cv_stopped: "■",
  winning_creative: "★",
  scale_opportunity: "↑",
};

const STAGE_LABEL: Record<AdFinding["stage"], string> = { impression: "表示", click: "クリック（Creative）", landing_page: "LP", conversion: "CV", delivery: "配信" };

export function variableLabel(v: string | null | undefined): string {
  return v ? (VARIABLE_LABELS[v as TestVariable] ?? v) : "—";
}
export function angleLabel(a: string | null | undefined): string {
  return a ? (ANGLE_LABELS[a as CreativeAngle] ?? a) : "—";
}

/** CTA for a finding: Creative test → Studio prefilled; LP → LP; delivery → Ads Manager (human). */
export function FindingCta({ finding, hypothesisId, landingPageUrl }: { finding: AdFinding; hypothesisId: string | null; landingPageUrl?: string | null }) {
  if (finding.suggestedVariable === "landing_page") {
    return landingPageUrl ? (
      <a className="button small" href={landingPageUrl} target="_blank" rel="noreferrer noopener">
        LPを確認 ↗
      </a>
    ) : (
      <span className="loc-pill">LPを確認</span>
    );
  }
  if (finding.suggestedVariable && hypothesisId) {
    return (
      <Link className="button small primary" href={`/studio?hypothesis=${hypothesisId}`}>
        ✧ Creative案を作る
      </Link>
    );
  }
  return <span className="loc-pill">Ads Managerで確認（人の判断）</span>;
}

function fmtEvidence(metric: string, v: number | null): string {
  if (v === null) return "—";
  if (/ctr|cvr|rate/.test(metric)) return fmtPct(v);
  if (/cpa|cpc|cpm|spend/.test(metric)) return fmtYen(v);
  return fmtNum(v, 2);
}

export function FindingCard({ finding, hypothesisId, landingPageUrl, compact }: { finding: AdFinding; hypothesisId: string | null; landingPageUrl?: string | null; compact?: boolean }) {
  return (
    <article className={`attention-item ${finding.type}`} data-testid={`finding-${finding.kind}`}>
      <span className="dot">{KIND_ICON[finding.kind]}</span>
      <div>
        <b>
          <span className={`sev ${finding.severity}`}>P{finding.priority}</span>
          {finding.entityName}：{finding.problem}
        </b>
        <small>{finding.observation}</small>
        {!compact && (
          <div className="review-box" style={{ marginTop: 8 }}>
            <div>
              <b>考えられる原因：</b>
              {finding.possibleCause}
            </div>
            <div>
              <b>仮説：</b>
              {finding.hypothesis}
            </div>
            <div>
              <b>推奨アクション：</b>
              {finding.recommendedAction}
            </div>
            <div>
              <b>期待効果：</b>
              {finding.expectedImpact}
              <span className="table-muted">
                {" "}
                · ファネル: {STAGE_LABEL[finding.stage]} · 変える変数: {variableLabel(finding.suggestedVariable)} · 確度 {Math.round(finding.confidence * 100)}%
              </span>
            </div>
            {finding.evidence.length > 0 && (
              <div className="table-muted" style={{ marginTop: 4 }}>
                根拠：
                {finding.evidence
                  .map((e) => `${e.metric.toUpperCase()} ${fmtEvidence(e.metric, e.current)}${e.baseline !== null ? ` / 比較 ${fmtEvidence(e.metric, e.baseline)}` : ""}${e.changePct !== null ? `（${e.changePct >= 0 ? "+" : ""}${Math.round(e.changePct * 100)}%）` : ""} [${e.window}]`)
                  .join(" ・ ")}
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
        <FindingCta finding={finding} hypothesisId={hypothesisId} landingPageUrl={landingPageUrl} />
      </div>
    </article>
  );
}

/** Daily spend (area) + conversions (dashed) for the last 30 days. */
export function SpendCvChart({ data }: { data: { date: string; spend: number; conversions: number }[] }) {
  if (data.length < 2) return <div className="insufficient">グラフを表示するには2日以上のデータが必要です。</div>;
  const W = 610;
  const H = 160;
  const maxS = Math.max(...data.map((d) => d.spend), 1);
  const maxC = Math.max(...data.map((d) => d.conversions), 1);
  const x = (i: number) => (i / (data.length - 1)) * (W - 20);
  const ys = (v: number) => H - 10 - (v / maxS) * (H - 30);
  const yc = (v: number) => H - 10 - (v / maxC) * (H - 30);
  const spend = data.map((d, i) => `${x(i).toFixed(1)},${ys(d.spend).toFixed(1)}`).join(" ");
  const cv = data.map((d, i) => `${x(i).toFixed(1)},${yc(d.conversions).toFixed(1)}`).join(" ");
  const labels = [0, Math.floor(data.length / 3), Math.floor((2 * data.length) / 3), data.length - 1];
  return (
    <div className="chart-wrap ad-chart">
      <svg viewBox={`0 0 ${W} ${H + 20}`} preserveAspectRatio="none" role="img" aria-label="日別の費用とCVの推移">
        <defs>
          <linearGradient id="adsArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#69a591" stopOpacity=".22" />
            <stop offset="100%" stopColor="#69a591" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[30, 75, 120, H - 10].map((y) => (
          <line key={y} className="chart-grid" x1="0" y1={y} x2={W} y2={y} />
        ))}
        <path d={`M${spend.replaceAll(" ", " L")} L${x(data.length - 1)} ${H - 10} L0 ${H - 10} Z`} fill="url(#adsArea)" />
        <polyline className="chart-line" points={spend} />
        <polyline className="chart-line secondary" points={cv} />
        {labels.map((i) => (
          <text key={i} className="chart-label" x={Math.min(x(i), W - 40)} y={H + 14}>
            {data[i]?.date.slice(5).replace("-", "/")}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function DecisionPill({ decision }: { decision: string | null | undefined }) {
  const map: Record<string, [string, string]> = {
    winner: ["勝ち", ""],
    loser: ["負け", "failed"],
    inconclusive: ["差なし", "draft"],
    insufficient_data: ["データ不足", "review"],
  };
  const [label, cls] = map[decision ?? ""] ?? ["判定前", "draft"];
  return <span className={`status-pill ${cls}`}>{label}</span>;
}

export function ExperimentStatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    draft: ["下書き", "draft"],
    approved: ["承認済み・未反映", "approved"],
    running: ["実施中", "queued"],
    completed: ["完了", ""],
    cancelled: ["中止", "failed"],
  };
  const [label, cls] = map[status] ?? [status, "draft"];
  return <span className={`status-pill ${cls}`}>{label}</span>;
}
