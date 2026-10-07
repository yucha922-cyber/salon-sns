import Link from "next/link";
import { requireAppContext } from "@/lib/auth/context";
import { loadAdsPageData, loadCreativeLearnings } from "@/lib/ads/app";
import { fmtNum, fmtPct, fmtYen } from "@/lib/ads/metrics";
import { buildCreativeRows, type GoalFilter } from "@/lib/ads/views";
import { PageHeading } from "@/components/ui/page-heading";
import { AdsTabs, angleLabel, DecisionPill, GoalTabs } from "@/components/ads/ui";

export const metadata = { title: "Creative比較" };

export default async function CreativeComparisonPage({ searchParams }: { searchParams: Promise<{ goal?: string; days?: string }> }) {
  const app = await requireAppContext();
  const q = await searchParams;
  const goal: GoalFilter = q.goal === "acquisition" || q.goal === "recruitment" ? q.goal : "all";
  const days = q.days === "7" ? 7 : q.days === "30" ? 30 : 14;
  const data = await loadAdsPageData(app);
  const learnings = await loadCreativeLearnings(app);
  const rows = buildCreativeRows(data.ws, { experiments: data.experiments, learnings, findings: data.findings, goal, days });

  return (
    <>
      <PageHeading eyebrow="Meta広告 × AI" title="Creative比較" description="Hook・切り口・オーディエンスごとに成果を比較します。CPAの良い順。⚠はMetaポリシー上の注意がある表現です。" />
      <AdsTabs current="/ads/creatives" />
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 8 }}>
        <GoalTabs base="/ads/creatives" goal={goal} extra={`&days=${days}`} />
        <div className="view-toggle">
          {[7, 14, 30].map((d) => (
            <Link key={d} className={`button small ${days === d ? "soft" : ""}`} style={{ border: 0, borderRadius: 0 }} href={`/ads/creatives?goal=${goal}&days=${d}`}>
              直近{d}日
            </Link>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="table-wrap">
          <table className="data-table" data-testid="creative-table">
            <thead>
              <tr>
                <th></th>
                <th>Hook / 広告</th>
                <th>切り口</th>
                <th>オーディエンス</th>
                <th>費用</th>
                <th>CTR</th>
                <th>CVR</th>
                <th>CPA / 応募単価</th>
                <th>ROAS</th>
                <th>Frequency</th>
                <th>状態</th>
                <th>テスト / 学び</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ad.id}>
                  <td>
                    <span className="post-thumb" title={r.creative?.format ?? ""}>
                      {r.creative?.format === "video" ? "▶" : "▣"}
                    </span>
                  </td>
                  <td style={{ whiteSpace: "normal", minWidth: 220 }}>
                    <b>{r.creative?.hook || r.ad.name}</b>
                    {r.policy.some((w) => w.level === "warn") && (
                      <span className="sev medium" style={{ marginLeft: 6 }} title={r.policy.map((w) => w.message).join("\n")}>
                        ⚠ ポリシー注意
                      </span>
                    )}
                    <div className="table-muted" style={{ fontSize: 9, marginTop: 3 }}>
                      {r.campaign?.name} · {r.ad.name}
                      {r.finding && <span className={`sev ${r.finding.severity}`} style={{ marginLeft: 6 }}>{r.finding.problem}</span>}
                    </div>
                  </td>
                  <td>{angleLabel(r.creative?.angle)}</td>
                  <td style={{ whiteSpace: "normal", maxWidth: 160 }} className="table-muted">
                    {r.audience || "—"}
                  </td>
                  <td>{fmtYen(r.metrics.spend)}</td>
                  <td>{fmtPct(r.metrics.ctr)}</td>
                  <td>{fmtPct(r.metrics.cvr)}</td>
                  <td className="table-strong">{fmtYen(r.metrics.cpa)}</td>
                  <td>{r.metrics.roas === null ? "—" : `${r.metrics.roas.toFixed(2)}x`}</td>
                  <td>{fmtNum(r.metrics.frequency, 2)}</td>
                  <td>
                    <span className={`status-pill ${r.status === "ACTIVE" ? "" : "draft"}`}>{r.status === "ACTIVE" ? "配信中" : r.status === "PAUSED" ? "停止" : r.status}</span>
                  </td>
                  <td style={{ whiteSpace: "normal", maxWidth: 220 }}>
                    {r.testDecision && (
                      <Link href={`/ads/experiments/${r.testDecision.experimentId}`} style={{ marginRight: 4 }}>
                        <span className="loc-pill">{r.testDecision.label}</span> <DecisionPill decision={r.testDecision.decision} />
                      </Link>
                    )}
                    {r.learning && <div className="table-muted" style={{ fontSize: 9, marginTop: 3 }}>❖ {r.learning.attributes?.principle || r.learning.learning}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <div className="insufficient">広告データがありません。</div>}
      </div>
    </>
  );
}
