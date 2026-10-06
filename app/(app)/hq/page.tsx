import { requireAppContext } from "@/lib/auth/context";
import type { Post } from "@/lib/domain/types";
import { PageHeading } from "@/components/ui/page-heading";
import { HqBoard } from "@/components/hq/hq-board";

export default async function HqPage() {
  const { repo, current } = await requireAppContext();
  const orgId = current.organization.id;
  const [campaigns, profiles, posts] = await Promise.all([repo.listHqCampaigns(orgId), repo.listLocationProfiles(orgId), repo.listPosts(orgId)]);
  const postsByCampaign: Record<string, (Post & { locationName: string })[]> = {};
  for (const p of posts) {
    if (!p.hqCampaignId) continue;
    const locationName = profiles.find((l) => l.locationId === p.locationId)?.locationName ?? "本部";
    (postsByCampaign[p.hqCampaignId] ??= []).push({ ...p, locationName });
  }
  return (
    <>
      <PageHeading eyebrow="本部・店舗" title="本部テンプレート"
        description="本部で月のテーマ・必須メッセージ・ローカライズのルールを決めて全店舗に配布。各店舗の月間計画や投稿にAIが自動で反映します。" />
      <HqBoard
        campaigns={campaigns}
        locations={profiles.map((p) => ({ id: p.locationId, name: p.locationName, configured: Boolean(p.area || p.localKeywords.length) }))}
        postsByCampaign={postsByCampaign}
        readOnly={current.role === "viewer"}
      />
    </>
  );
}
