import Link from "next/link";
import { requireAppContext } from "@/lib/auth/context";
import { loadAdsPageData } from "@/lib/ads/app";
import { fmtYen } from "@/lib/ads/metrics";
import { PageHeading } from "@/components/ui/page-heading";
import { AdsTabs, DecisionPill, ExperimentStatusPill, variableLabel } from "@/components/ads/ui";

export const metadata = { title: "A/Bテスト" };

export default async function ExperimentsPage() {
  const app = await requireAppContext();
  const { experiments, ws } = await loadAdsPageData(app);
  const campaignName = (id: string | null) => ws.campaigns.find((c) => c.id === id)?.name ?? "—";
  return (
    <>
      <PageHeading eyebrow="Meta広告 × AI" title="A/Bテスト" description="1テスト＝1変数。AIが仮説とCreativeを用意し、人が承認してからMetaへ反映します。勝者は最低条件を満たすまで決めません。" />
      <AdsTabs current="/ads/experiments" />
      <div className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>テスト</th>
                <th>キャンペーン</th>
                <th>変える変数</th>
                <th>主KPI</th>
                <th>バリエーション</th>
                <th>状態</th>
                <th>判定</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map((e) => (
                <tr key={e.id}>
                  <td className="table-strong">
                    <Link href={`/ads/experiments/${e.id}`}>{e.name}</Link>
                  </td>
                  <td>{campaignName(e.campaignId)}</td>
                  <td>{variableLabel(e.variable)}</td>
                  <td>{e.primaryMetric === "application_cpa" ? "応募単価" : e.primaryMetric.toUpperCase()}</td>
                  <td className="table-muted">{e.variants.map((v) => `${v.label} ${v.cpa ? fmtYen(v.cpa) : "—"}`).join(" / ")}</td>
                  <td>
                    <ExperimentStatusPill status={e.status} />
                  </td>
                  <td>{e.status === "draft" || e.status === "approved" ? "—" : <DecisionPill decision={e.decision ?? e.resultSummary?.decision} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!experiments.length && <div className="insufficient">まだテストはありません。ダッシュボードの「Creative案を作る」から始められます。</div>}
      </div>
    </>
  );
}
