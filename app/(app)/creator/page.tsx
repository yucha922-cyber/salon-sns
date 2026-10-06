import { requireAppContext } from "@/lib/auth/context";
import { PageHeading } from "@/components/ui/page-heading";
import { PostCreator } from "@/components/creator/post-creator";

export default async function CreatorPage({ searchParams }: { searchParams: Promise<{ date?: string; theme?: string }> }) {
  const { brain } = await requireAppContext();
  const params = await searchParams;
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
        }}
      />
    </>
  );
}
