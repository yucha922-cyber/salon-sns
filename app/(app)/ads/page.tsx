import Link from "next/link";
import { requireAppContext } from "@/lib/auth/context";
import { loadAdsPageData, loadCreativeLearnings } from "@/lib/ads/app";
import { fmtPct, fmtYen } from "@/lib/ads/metrics";
import { buildCreativeRows, buildDashboard, type GoalFilter } from "@/lib/ads/views";
import { PageHeading } from "@/components/ui/page-heading";
import { EmptyState } from "@/components/ui/states";
import { AdsTabs, angleLabel, DecisionPill, ExperimentStatusPill, FindingCard, GoalTabs, KpiCard, SpendCvChart } from "@/components/ads/ui";
import { AnalyzeAdsButton, SyncAdsButton } from "@/components/ads/ads-buttons";

export const metadata = { title: "広告ダッシュボード" };

export default async function AdsPage({ searchParams }: { searchParams: Promise<{ goal?: string }> }) {
  const app = await requireAppContext();
  const q = await searchParams;
  const goal: GoalFilter = q.goal === "acquisition" || q.goal === "recruitment" ? q.goal : "all";
  const data = await loadAdsPageData(app);
  const { ctx, ws } = data;
  const [accounts, conversions, hypotheses, analyses, recommendations, learnings] = await Promise.all([
    ctx.reader.listAdAccounts(ctx.organizationId),
    ctx.reader.listConversions(ctx.organizationId),
    ctx.reader.listHypotheses(ctx.organizationId),
    ctx.reader.listAnalyses(ctx.organizationId, 1),
    app.repo.listRecommendations(ctx.organizationId),
    loadCreativeLearnings(app),
  ]);
  const readOnly = ctx.role === "viewer";
  const connected = accounts.filter((a) => a.connectionStatus !== "disconnected");

  if (!connected.length) {
    return (
      <>
        <PageHeading eyebrow="Meta広告 × AI" title="広告ダッシュボード" description="広告データを取得し、AIが問題検知→原因仮説→Creative改善案まで作ります。配信の変更は必ず人が承認します。" />
        <AdsTabs current="/ads" />
        <div className="panel">
          <EmptyState icon="⌁" title="Meta広告アカウントが未接続です" description="接続すると、過去30日のInsightsを日別に取得し、Creative疲労・CTR低下・LPの問題などをAIが検知します。" action={{ label: "広告アカウントを接続", href: "/ads/connect" }} />
        </div>
      </>
    );
  }

  const view = buildDashboard(ws, { goal, findings: data.findings, experiments: data.experiments, conversions });
  const openHyp = hypotheses.filter((h) => h.status === "proposed" || h.status === "accepted" || h.status === "in_test");
  const hypothesisFor = (adId: string, variable: string | null) => openHyp.find((h) => h.adId === adId && h.changeVariable === variable)?.id ?? null;
  const lpOf = (campaignId: string | null) => ws.campaigns.find((c) => c.id === campaignId)?.landingPageUrl ?? null;
  const winners = buildCreativeRows(ws, { experiments: data.experiments, learnings, findings: data.findings, goal })
    .filter((r) => r.metrics.conversions >= 5)
    .slice(0, 4);
  const adRecs = recommendations.filter((r) => r.source === "ads" && r.status === "pending" && (goal === "all" || (goal === "recruitment" ? r.category === "recruitment" : r.category !== "recruitment"))).slice(0, 6);
  const analysis = analyses[0];
  const reauth = accounts.find((a) => a.connectionStatus === "reauthorization_required" || a.connectionStatus === "error");

  return (
    <>
      <PageHeading
        eyebrow="Meta広告 × AI"
        title="広告ダッシュボード"
        description={`今日やるべきことを上から順に。データは ${view.end ?? "—"} まで（前7日比）。AIは提案のみで、配信・予算・ターゲティングは変更しません。`}
        actions={
          <>
            {connected[0] && <SyncAdsButton adAccountId={connected[0].id} disabled={readOnly} />}
            <AnalyzeAdsButton disabled={readOnly} />
          </>
        }
      />
      <AdsTabs current="/ads" />
      {reauth && (
        <div className="issue warning" style={{ marginBottom: 12 }}>
          <b>{reauth.name} の再接続が必要です</b>
          <small>{reauth.connectionError ?? "トークンの期限切れ・権限変更の可能性があります。"} <Link href="/ads/connect">接続設定へ</Link></small>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <GoalTabs base="/ads" goal={goal} />
        <span className="activity-note">
          {connected.map((a) => `${a.name}${a.metadata.mock ? "（デモ）" : ""}`).join(" / ")} · 最終同期 {connected[0]?.lastSyncedAt ? new Date(connected[0].lastSyncedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "未同期"}
        </span>
      </div>

      <section className="metric-grid" style={{ gridTemplateColumns: "repeat(6,minmax(0,1fr))" }} data-testid="ads-kpis">
        {view.kpis.map((k) => (
          <KpiCard key={k.key} kpi={k} />
        ))}
      </section>

      {analysis && (
        <div className="insight-card section-spacer">
          <div className="insight-label">
            <span className="spark">✳</span> AIの要約（{analysis.periodStart}〜{analysis.periodEnd}）
          </div>
          <p style={{ marginTop: 8 }}>{analysis.summary}</p>
        </div>
      )}

      <section className="content-grid">
        <div className="panel" data-testid="needs-attention">
          <div className="panel-heading">
            <div>
              <div className="panel-title">要対応（Needs Attention）</div>
              <div className="panel-subtitle">優先度順。単一の数値ではなく、過去平均・同じ広告セット・同じ目的と比較して判定しています</div>
            </div>
          </div>
          {view.attention.length ? (
            <div className="attention-list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {view.attention.map((f) => (
                <FindingCard key={f.id} finding={f} hypothesisId={f.entityType === "ad" ? hypothesisFor(f.entityId, f.suggestedVariable) : null} landingPageUrl={lpOf(f.campaignId)} />
              ))}
            </div>
          ) : (
            <div className="insufficient">大きな問題は検知されていません。</div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-title" style={{ marginBottom: 10 }}>チャンス（Opportunities）</div>
            {view.opportunities.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {view.opportunities.map((f) => (
                  <FindingCard key={f.id} compact finding={f} hypothesisId={f.entityType === "ad" ? hypothesisFor(f.entityId, f.suggestedVariable) : null} />
                ))}
              </div>
            ) : (
              <p className="activity-note">まだありません</p>
            )}
          </div>
          <div className="panel" data-testid="running-tests">
            <div className="panel-heading">
              <div className="panel-title">実施中のテスト</div>
              <Link className="button small" href="/ads/experiments">
                すべて →
              </Link>
            </div>
            {view.runningTests.length ? (
              <div className="mini-list">
                {view.runningTests.map((e) => (
                  <Link key={e.id} href={`/ads/experiments/${e.id}`} className="post-row" style={{ textDecoration: "none", color: "inherit" }}>
                    <div className="row-main">
                      <b>{e.name}</b>
                      <small>
                        {e.variants.map((v) => `${v.label}: ${v.cpa ? fmtYen(v.cpa) : "—"}`).join(" / ")} ・ {e.resultSummary?.missing.length ? `不足: ${e.resultSummary.missing.slice(0, 2).join("、")}` : (e.resultSummary?.reasons[0] ?? "")}
                      </small>
                    </div>
                    <div className="row-meta">
                      <ExperimentStatusPill status={e.status} />
                      <br />
                      {e.status === "running" && <DecisionPill decision={e.resultSummary?.decision} />}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="activity-note">実施中のテストはありません</p>
            )}
          </div>
        </div>
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <div className="panel-title">費用とCVの推移</div>
              <div className="panel-subtitle">日別（Meta計測）。自社計測CVは「自社計測CV」タブ</div>
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-dot" />
                費用
              </span>
              <span>
                <i className="legend-dot orange" />
                CV
              </span>
            </div>
          </div>
          <SpendCvChart data={view.trend} />
        </div>
        <div className="panel" data-testid="winning-creatives">
          <div className="panel-heading">
            <div className="panel-title">勝ちCreative（直近14日 CPA順）</div>
            <Link className="button small" href="/ads/creatives">
              比較表 →
            </Link>
          </div>
          <div className="mini-list">
            {winners.map((r) => (
              <div className="post-row" key={r.ad.id}>
                <span className="post-thumb">{r.creative?.format === "video" ? "▶" : "▣"}</span>
                <div className="row-main">
                  <b>{r.creative?.hook || r.ad.name}</b>
                  <small>
                    {r.campaign?.name} · {angleLabel(r.creative?.angle)}
                  </small>
                </div>
                <div className="row-meta">
                  {r.campaign?.goal === "recruitment" ? "応募単価" : "CPA"} <b>{fmtYen(r.metrics.cpa)}</b>
                  <br />
                  <small>CTR {fmtPct(r.metrics.ctr)}</small>
                </div>
              </div>
            ))}
            {!winners.length && <p className="activity-note">CVが5件以上ある広告がまだありません</p>}
          </div>
        </div>
      </section>

      <div className="panel section-spacer" data-testid="ai-recommendations">
        <div className="panel-heading">
          <div>
            <div className="panel-title">AIの提案（承認待ち）</div>
            <div className="panel-subtitle">「Creative案を作る」で、ブランド・店舗・ペルソナ・課題・仮説・現行Creative・実績を引き継いでCreative Studioが開きます</div>
          </div>
          <Link className="button small" href="/analysis">
            提案の承認・却下 →
          </Link>
        </div>
        {adRecs.length ? (
          adRecs.map((r) => {
            const h = typeof r.payload?.hypothesisId === "string" ? r.payload.hypothesisId : null;
            const variable = r.payload?.variable;
            return (
              <div className="rec-item" key={r.id}>
                <div>
                  <h4>
                    <span className={`sev ${r.severity}`}>{r.severity === "high" ? "高" : r.severity === "medium" ? "中" : "低"}</span>
                    {r.title}
                  </h4>
                  <p>
                    {r.observation}
                    <br />
                    <b>次の一手：</b>
                    {r.recommendedAction}
                  </p>
                </div>
                <div>
                  {h && variable && variable !== "landing_page" ? (
                    <Link className="button small primary" href={`/studio?hypothesis=${h}`}>
                      ✧ Creative案を作る
                    </Link>
                  ) : (
                    <span className="loc-pill">{variable === "landing_page" ? "LPを確認" : "人の判断"}</span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <p className="activity-note">承認待ちの提案はありません。「AIで分析する」で最新データから作成します。</p>
        )}
      </div>

      <div className="panel section-spacer">
        <div className="panel-title" style={{ marginBottom: 8 }}>キャンペーン（直近7日）</div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>キャンペーン</th>
                <th>目的</th>
                <th>費用</th>
                <th>CV（Meta）</th>
                <th>CPA</th>
                <th>CTR</th>
                <th>CVR</th>
                <th>自社計測</th>
                <th>配信中の広告</th>
              </tr>
            </thead>
            <tbody>
              {view.campaigns.map((r) => (
                <tr key={r.campaign.id}>
                  <td className="table-strong">{r.campaign.name}</td>
                  <td>
                    <span className={`goal-pill ${r.campaign.goal}`}>{r.campaign.goal === "recruitment" ? "採用" : "集客"}</span>
                  </td>
                  <td>{fmtYen(r.last7.spend)}</td>
                  <td>{r.last7.conversions}</td>
                  <td>{fmtYen(r.last7.cpa)}</td>
                  <td>{fmtPct(r.last7.ctr)}</td>
                  <td>{fmtPct(r.last7.cvr)}</td>
                  <td>{r.firstParty || "—"}</td>
                  <td>{r.activeAds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
