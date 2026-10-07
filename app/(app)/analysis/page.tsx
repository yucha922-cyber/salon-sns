import Link from "next/link";
import { requireAppContext } from "@/lib/auth/context";
import { loadAdsPageData } from "@/lib/ads/app";
import { PageHeading } from "@/components/ui/page-heading";
import { RecommendationList } from "@/components/recommendations/recommendation-list";
import { FindingCard, variableLabel } from "@/components/ads/ui";
import { AnalyzeAdsButton } from "@/components/ads/ads-buttons";

const HYP_STATUS: Record<string, string> = { proposed: "提案", accepted: "採用・Creative作成中", in_test: "テスト中", validated: "検証済み（支持）", invalidated: "検証済み（不支持）", rejected: "見送り" };

export default async function AnalysisPage() {
  const app = await requireAppContext();
  const { repo, current } = app;
  const orgId = current.organization.id;
  const [recommendations, accounts, ads] = await Promise.all([repo.listRecommendations(orgId), repo.listAccounts(orgId), loadAdsPageData(app)]);
  const [analysis] = await ads.ctx.reader.listAnalyses(orgId, 1);
  const hypotheses = (await ads.ctx.reader.listHypotheses(orgId)).slice(0, 12);
  const open = hypotheses.filter((h) => h.status === "proposed" || h.status === "accepted" || h.status === "in_test");
  const hypFor = (adId: string, v: string | null) => open.find((h) => h.adId === adId && h.changeVariable === v)?.id ?? null;
  return (
    <>
      <PageHeading eyebrow="AIマーケター" title="AI分析と改善提案"
        description="AIが運用状況から改善案を出し、人が承認・却下・完了を判断します。承認しても自動で実行されることはありません。" />
      <div className="panel">
        <RecommendationList
          recommendations={recommendations}
          accountLabels={Object.fromEntries(accounts.map((a) => [a.id, a.handle]))}
          readOnly={current.role === "viewer"}
        />
      </div>
      {ads.ws.campaigns.length > 0 && (
        <div className="panel section-spacer" data-testid="ad-analysis">
          <div className="panel-heading">
            <div>
              <div className="panel-title">広告のAI分析（Observation → Problem → Cause → Evidence → Hypothesis → Action）</div>
              <div className="panel-subtitle">{analysis ? `${analysis.periodStart}〜${analysis.periodEnd} · ${new Date(analysis.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} 作成` : "まだ分析がありません"}</div>
            </div>
            <AnalyzeAdsButton disabled={current.role === "viewer"} />
          </div>
          {analysis && <p className="recommendation-callout">{analysis.summary}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {(analysis?.findings ?? []).map((f) => (
              <FindingCard key={f.id} finding={f} hypothesisId={f.entityType === "ad" ? hypFor(f.entityId, f.suggestedVariable) : null} landingPageUrl={ads.ws.campaigns.find((c) => c.id === f.campaignId)?.landingPageUrl} />
            ))}
          </div>
        </div>
      )}
      {hypotheses.length > 0 && (
        <div className="panel section-spacer">
          <div className="panel-title" style={{ marginBottom: 6 }}>Creative仮説</div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>仮説</th><th>変える変数</th><th>状態</th><th></th></tr>
              </thead>
              <tbody>
                {hypotheses.map((h) => (
                  <tr key={h.id}>
                    <td style={{ whiteSpace: "normal" }}><b>{h.hypothesis}</b><div className="table-muted" style={{ fontSize: 9 }}>{h.problem}</div></td>
                    <td>{variableLabel(h.changeVariable)}</td>
                    <td>{HYP_STATUS[h.status] ?? h.status}</td>
                    <td><Link className="button small" href={`/studio?hypothesis=${h.id}`}>開く</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
