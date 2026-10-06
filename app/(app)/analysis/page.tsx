import { requireAppContext } from "@/lib/auth/context";
import { getCampaigns, getRecommendations } from "@/lib/services/analytics";
import { PageHeading } from "@/components/ui/page-heading";
import { EmptyState } from "@/components/ui/states";
import { AnalysisView } from "@/components/ads/analysis-view";

export default async function AnalysisPage() {
  const { current } = await requireAppContext();
  const recommendations = getRecommendations(current.organization);
  const canAnalyze = getCampaigns(current.organization).length > 0;
  return (
    <>
      <PageHeading eyebrow="AIマーケター" title="AI分析と改善提案" description="データを見つめるだけでなく、次のアクションまで提案します。" />
      {recommendations.length || canAnalyze ? (
        <AnalysisView recommendations={recommendations} canAnalyze={canAnalyze} />
      ) : (
        <div className="panel">
          <EmptyState icon="◉" title="分析できるデータがまだありません"
            description="SNS・広告アカウントの連携後、AIが投稿と広告の実績から改善点を提案します。いまはAIマーケターに戦略を相談できます。"
            action={{ label: "AIマーケターに相談", href: "/chat" }} />
        </div>
      )}
    </>
  );
}
