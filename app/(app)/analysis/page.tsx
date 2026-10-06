import { requireAppContext } from "@/lib/auth/context";
import { getCampaigns } from "@/lib/services/analytics";
import { PageHeading } from "@/components/ui/page-heading";
import { RecommendationList } from "@/components/recommendations/recommendation-list";
import { AdAnalysisPanel } from "@/components/ads/analysis-view";

export default async function AnalysisPage() {
  const { repo, current } = await requireAppContext();
  const orgId = current.organization.id;
  const [recommendations, accounts] = await Promise.all([repo.listRecommendations(orgId), repo.listAccounts(orgId)]);
  const canAnalyzeAds = getCampaigns(current.organization).length > 0;
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
      {canAnalyzeAds && <AdAnalysisPanel />}
    </>
  );
}
