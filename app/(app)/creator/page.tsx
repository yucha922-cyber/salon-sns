import { requireAppContext } from "@/lib/auth/context";
import { PageHeading } from "@/components/ui/page-heading";
import { PostCreator } from "@/components/creator/post-creator";
import { ACCOUNT_GOAL_LABELS } from "@/lib/domain/labels";

export default async function CreatorPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; theme?: string; account?: string; campaign?: string; post?: string }>;
}) {
  const { brain, repo, current } = await requireAppContext();
  const params = await searchParams;
  const orgId = current.organization.id;
  const [accounts, campaigns, posts] = await Promise.all([
    repo.listAccounts(orgId),
    repo.listHqCampaigns(orgId),
    params.post ? repo.listPosts(orgId) : Promise.resolve([]),
  ]);
  // Approved plan item → caption step (only posts of the current organization).
  const plannedPost = params.post ? (posts.find((p) => p.id === params.post) ?? null) : null;
  const toLocal = (iso: string | null) => {
    if (!iso) return "";
    const jst = new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString();
    return jst.slice(0, 16);
  };
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
      <PageHeading eyebrow="コンテンツ制作" title={plannedPost ? "キャプション作成" : "AI投稿作成"}
        description={plannedPost ? `承認済みの企画「${plannedPost.title}」の本文をつくります。保存するとこの投稿が更新されます。` : "Brand Brainをもとに、あなたのお店らしい投稿をつくります。"} />
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
          campaigns: campaigns.filter((c) => c.status === "active" || c.status === "draft").map((c) => ({ id: c.id, name: c.name, theme: c.sharedTheme })),
          initialAccountId: plannedPost?.accountId ?? params.account ?? "",
          initialCampaignId: plannedPost?.hqCampaignId ?? params.campaign ?? "",
          planned: plannedPost
            ? {
                postId: plannedPost.id,
                platform: plannedPost.platform,
                contentType: plannedPost.contentType,
                theme: plannedPost.planning.theme || plannedPost.title,
                notes: [plannedPost.planning.hook && `フック：${plannedPost.planning.hook}`, plannedPost.planning.summary, plannedPost.planning.funnelStage && `ファネル：${plannedPost.planning.funnelStage}`]
                  .filter(Boolean)
                  .join(" / ")
                  .slice(0, 500),
                target: plannedPost.planning.target,
                scheduledAtLocal: toLocal(plannedPost.scheduledAt),
              }
            : null,
        }}
      />
    </>
  );
}
