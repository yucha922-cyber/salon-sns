import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAppContext } from "@/lib/auth/context";
import { loadAdsPageData } from "@/lib/ads/app";
import { angleLabel, AdsTabs, DecisionPill, ExperimentStatusPill, variableLabel } from "@/components/ads/ui";
import { ExperimentControls } from "@/components/ads/experiment-controls";
import { fmtNum, fmtPct, fmtYen } from "@/lib/ads/metrics";
import { PageHeading } from "@/components/ui/page-heading";

export const metadata = { title: "A/Bテスト詳細" };

export default async function ExperimentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await requireAppContext();
  const { ctx, ws, experiments } = await loadAdsPageData(app);
  const e = experiments.find((x) => x.id === id);
  if (!e) notFound();
  const creatives = new Map(ws.creatives.map((c) => [c.id, c]));
  const adSet = ws.adSets.find((s) => s.id === e.adSetId);
  const campaign = ws.campaigns.find((c) => c.id === e.campaignId);
  const accounts = await ctx.reader.listAdAccounts(ctx.organizationId);
  const isMock = Boolean(accounts.find((a) => a.id === campaign?.adAccountId)?.metadata.mock) || ctx.isDemo;
  const canEdit = ctx.role !== "viewer";
  const canOperate = ctx.role === "owner" || ctx.role === "admin" || (ctx.role === "editor" && ctx.locationIds !== null);
  const result = e.resultSummary;
  const c = e.criteria;
  const metricLabel = e.primaryMetric === "application_cpa" ? "応募単価" : e.primaryMetric.toUpperCase();
  const recruit = e.goal === "recruitment";
  return (
    <>
      <PageHeading
        eyebrow="A/Bテスト"
        title={e.name}
        description={`${campaign?.name ?? ""} · 広告セット「${adSet?.name ?? ""}」 · 変える変数: ${variableLabel(e.variable)} · 主KPI: ${metricLabel}`}
        actions={
          <ExperimentControls
            experimentId={e.id}
            status={e.status}
            launched={Boolean(e.launchedAt)}
            canEdit={canEdit}
            canOperate={canOperate}
            adSetName={adSet?.name ?? ""}
            challengerCount={e.variants.filter((v) => v.role === "challenger").length}
            decision={result?.decision ?? null}
            winnerLabel={result?.winnerLabel ?? null}
            reasons={result?.reasons ?? []}
            missing={result?.missing ?? []}
            isMock={isMock}
          />
        }
      />
      <AdsTabs current="/ads/experiments" />
      <section className="content-grid" style={{ marginTop: 0 }}>
        <div className="panel">
          <div className="panel-heading">
            <div className="panel-title">仮説</div>
            <ExperimentStatusPill status={e.status} />
          </div>
          <p style={{ fontSize: 11, lineHeight: 1.8, margin: 0 }}>{e.hypothesis}</p>
          <div className="table-wrap section-spacer">
            <table className="data-table" data-testid="variant-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Creative（Hook）</th>
                  <th>費用</th>
                  <th>表示</th>
                  <th>クリック</th>
                  <th>CTR</th>
                  <th>{recruit ? "応募" : "CV"}</th>
                  <th>{recruit ? "応募率" : "CVR"}</th>
                  <th>{metricLabel}</th>
                  <th>Freq.</th>
                  <th>判定</th>
                </tr>
              </thead>
              <tbody>
                {e.variants.map((v) => {
                  const cr = v.creativeId ? creatives.get(v.creativeId) : undefined;
                  return (
                    <tr key={v.id}>
                      <td className="table-strong">
                        {v.label}
                        <div className="table-muted" style={{ fontSize: 8 }}>{v.role === "control" ? "Control" : "Challenger"}</div>
                      </td>
                      <td style={{ whiteSpace: "normal", minWidth: 200 }}>
                        <b>{cr?.hook || cr?.headline || "—"}</b>
                        <div className="table-muted" style={{ fontSize: 9 }}>{angleLabel(cr?.angle)}{v.providerAdId ? ` · Meta広告ID ${v.providerAdId}` : " · 未作成"}</div>
                      </td>
                      <td>{fmtYen(v.spend)}</td>
                      <td>{fmtNum(v.impressions)}</td>
                      <td>{fmtNum(v.clicks)}</td>
                      <td>{fmtPct(v.ctr)}</td>
                      <td>{fmtNum(v.conversions)}</td>
                      <td>{fmtPct(v.cvr)}</td>
                      <td className="table-strong">{fmtYen(v.cpa)}</td>
                      <td>{fmtNum(v.frequency, 2)}</td>
                      <td>{e.status === "running" || e.status === "completed" ? <DecisionPill decision={v.decision} /> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {e.status === "running" && <p className="activity-note">※ 同じ広告セット内での比較です（Metaの配信最適化により表示配分は均等になりません）。判定はCVR / CTRの差の確度と最低条件で行います。</p>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel" data-testid="evaluation">
            <div className="panel-title" style={{ marginBottom: 8 }}>判定</div>
            {result ? (
              <div className="review-box">
                <b>
                  <DecisionPill decision={result.decision} /> {result.decision === "winner" ? `勝者: ${result.winnerLabel}` : result.decision === "inconclusive" ? "差なし" : "データ不足（勝者を決めません）"}
                </b>
                <ul>
                  {result.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                {result.missing.length > 0 && (
                  <>
                    <b>あと必要なもの</b>
                    <ul>
                      {result.missing.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </>
                )}
                <small className="table-muted">評価: {new Date(result.evaluatedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</small>
              </div>
            ) : (
              <p className="activity-note">配信開始後、日次で評価します。</p>
            )}
          </div>
          <div className="panel">
            <div className="panel-title" style={{ marginBottom: 8 }}>勝者判定の基準</div>
            <div className="context-line"><span>主KPIの改善幅</span><b>{Math.round(c.minLiftPct * 100)}%以上</b></div>
            <div className="context-line"><span>各案の最低費用</span><b>{fmtYen(c.minSpend)}</b></div>
            <div className="context-line"><span>最低表示 / クリック</span><b>{fmtNum(c.minImpressions)} / {fmtNum(c.minClicks)}</b></div>
            <div className="context-line"><span>最低{recruit ? "応募" : "CV"}</span><b>{c.minConversions}件</b></div>
            <div className="context-line"><span>最低実施期間</span><b>{c.minDays}日</b></div>
            <div className="context-line"><span>ガードレール（Frequency）</span><b>{c.maxFrequency}以下</b></div>
            <div className="context-line"><span>確度</span><b>80%以上</b></div>
          </div>
          <div className="panel">
            <div className="panel-title" style={{ marginBottom: 8 }}>承認の記録</div>
            <div className="context-line"><span>テストプラン承認</span><b>{e.approvedAt ? new Date(e.approvedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—"}</b></div>
            <div className="context-line"><span>Metaへ反映</span><b>{e.launchedAt ? new Date(e.launchedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—"}</b></div>
            <div className="context-line"><span>完了</span><b>{e.completedAt ? new Date(e.completedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—"}</b></div>
            {e.hypothesisId && (
              <Link className="button small section-spacer" href={`/studio?hypothesis=${e.hypothesisId}`}>
                仮説とCreativeを見る →
              </Link>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
