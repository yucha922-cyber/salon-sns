import { requireAppContext } from "@/lib/auth/context";
import { PageHeading } from "@/components/ui/page-heading";
import { PostCreator } from "@/components/creator/post-creator";
import { ACCOUNT_GOAL_LABELS } from "@/lib/domain/labels";

export default async function CreatorPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; theme?: string; account?: string; campaign?: string }>;
}) {
  const { brain, repo, current } = await requireAppContext();
  const params = await searchParams;
  const orgId = current.organization.id;
  const [accounts, campaigns] = await Promise.all([repo.listAccounts(orgId), repo.listHqCampaigns(orgId)]);
  const locationName = (id: string | null) => (id ? (brain.locations.find((l) => l.id === id)?.name ?? "") : "本部");
  const audience = brain.targetAudience;
  const targets = [
    [audience.ageRange, audience.occupation].filter(Boolean).join("・"),
    ...brain.personas.map((p) => p.name),
    "新規来店検討者",
  ].filter(Boolean);
  const tones = [...brain.brandTone, "親しみやすく", "端的に"].filter((t, i, all) => t && all.indexOf(t) === i);
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : "";

  return (
    <>
      <PageHeading eyebrow="コンテンツ制作" title="AI投稿作成" description="Brand Brainをもとに、あなたのお店らしい投稿をつくります。" />
      <PostCreator
        defaults={{
          brandHandle: brain.social.instagram || brain.social.threads || brain.brandName,
          locationLabel: brain.locations[0]?.name ?? brain.brandName,
          targets,
          tones,
          initialTheme: (params.theme ?? "").slice(0, 300) || (audience.painPoints[0] ? `${audience.painPoints[0]}を招く習慣3選` : ""),
          initialDate: date,
          accounts: accounts.map((a) => ({
            id: a.id,
            label: `${a.handle}（${locationName(a.locationId)}・${ACCOUNT_GOAL_LABELS[a.goal]}）`,
            handle: a.handle,
            platform: a.platform,
            locationId: a.locationId,
            tone: a.strategy.tone,
            persona: a.strategy.persona,
          })),
          locations: brain.locations.flatMap((l) => (l.id ? [{ id: l.id, name: l.name }] : [])),
          campaigns: campaigns.filter((c) => c.status !== "ended").map((c) => ({ id: c.id, name: c.name, theme: c.sharedTheme })),
          initialAccountId: params.account ?? "",
          initialCampaignId: params.campaign ?? "",
        }}
      />
    </>
  );
}
