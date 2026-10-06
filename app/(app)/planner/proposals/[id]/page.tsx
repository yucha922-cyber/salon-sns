import { notFound } from "next/navigation";
import { requireAppContext } from "@/lib/auth/context";
import { PageHeading } from "@/components/ui/page-heading";
import { ProposalReview } from "@/components/planning/proposal-review";
import { allowedContentTypes } from "@/lib/ai/prompts/monthly-plan";
import { PLATFORM_LABELS } from "@/lib/domain/labels";

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { repo, current, brain } = await requireAppContext();
  const orgId = current.organization.id;
  const [proposal, accounts, campaigns, pillars] = await Promise.all([
    repo.getPlanProposal(orgId, id),
    repo.listAccounts(orgId),
    repo.listHqCampaigns(orgId),
    repo.listContentPillars(orgId),
  ]);
  if (!proposal) notFound();
  const account = accounts.find((a) => a.id === proposal.accountId);
  const location = brain.locations.find((l) => l.id === proposal.locationId)?.name ?? "本部";
  return (
    <>
      <PageHeading eyebrow="SNS 運用 · AI企画案" title="月間計画の確認"
        description="AIが作った企画案です。承認したものだけが投稿カレンダーに追加されます。編集・再生成・却下もできます。" />
      <ProposalReview
        proposal={proposal}
        accountLabel={`${location} ${account ? `${PLATFORM_LABELS[account.platform]} ${account.handle}` : ""}`}
        campaignName={campaigns.find((c) => c.id === proposal.hqCampaignId)?.name ?? null}
        pillars={pillars}
        allowedTypes={allowedContentTypes(account?.platform ?? "instagram", proposal.goal)}
        readOnly={current.role === "viewer"}
      />
    </>
  );
}
