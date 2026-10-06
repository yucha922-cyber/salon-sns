import Link from "next/link";
import { requireAppContext } from "@/lib/auth/context";
import { getAdMetrics, getCampaigns } from "@/lib/services/analytics";
import { PageHeading } from "@/components/ui/page-heading";
import { MetricCard } from "@/components/ui/metric-card";
import { TrendChart } from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/states";
import { CampaignTable } from "@/components/ads/campaign-tabs";

export default async function AdsPage() {
  const { current } = await requireAppContext();
  const metrics = getAdMetrics(current.organization);
  const campaigns = getCampaigns(current.organization);

  return (
    <>
      <PageHeading eyebrow="有料広告" title="広告ダッシュボード" description="Meta広告の成果を把握し、次の一手を見つけましょう。"
        actions={current.organization.isDemo ? <span className="status-pill draft">デモデータ</span> : undefined} />
      {!metrics ? (
        <div className="panel">
          <EmptyState icon="⌁" title="Meta広告アカウントは未連携です"
            description="MVPでは広告APIに接続していません。連携後、費用・CTR・CPA・ROASがここに表示され、AIが改善案を提案します（変更は必ず承認後）。いまはCreative Studioで広告案を作成できます。"
            action={{ label: "Creative Studioで広告案をつくる", href: "/studio" }} />
        </div>
      ) : (
        <>
          <section className="metric-grid">{metrics.map((m) => <MetricCard key={m.label} metric={m} />)}</section>
          <section className="content-grid">
            <div className="panel">
              <div className="panel-heading">
                <div><div className="panel-title">広告パフォーマンス</div><div className="panel-subtitle">費用とコンバージョンの推移</div></div>
                <div className="chart-legend"><span><i className="legend-dot" />費用</span><span><i className="legend-dot orange" />コンバージョン</span></div>
              </div>
              <TrendChart kind="ads" />
            </div>
            <div className="insight-card">
              <div className="insight-label"><span className="spark">✳</span> AI分析</div>
              <h3>「美容整体 Before/After」のCTRが低下しています</h3>
              <p>CTRが過去7日平均より<strong>28%低下</strong>。一方でLPのCVRは維持されているため、広告クリエイティブの疲労が考えられます。</p>
              <div className="insight-footer"><span className="confidence">影響度　中</span><span className="priority-tag">改善機会</span></div>
              <div style={{ marginTop: 14 }}><Link className="button small soft" href="/analysis">改善案を確認 →</Link></div>
            </div>
          </section>
          <div className="panel section-spacer">
            <div className="panel-heading">
              <div><div className="panel-title">キャンペーン</div><div className="panel-subtitle">{campaigns.length}件のキャンペーン · デモデータ</div></div>
            </div>
            <CampaignTable campaigns={campaigns} />
          </div>
        </>
      )}
    </>
  );
}
