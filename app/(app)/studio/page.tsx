import { requireAppContext } from "@/lib/auth/context";
import { PageHeading } from "@/components/ui/page-heading";
import { CreativeStudio } from "@/components/studio/creative-studio";

export default async function StudioPage() {
  const { brain } = await requireAppContext();
  const yen = (n: number | null) => (n === null ? "" : ` ¥${n.toLocaleString("ja-JP")}`);
  const audience = [brain.targetAudience.ageRange, brain.targetAudience.occupation].filter(Boolean).join("・");
  return (
    <>
      <PageHeading eyebrow="広告クリエイティブ" title="Creative Studio" description="お店の強みとターゲットから、広告コンセプトをつくります。" />
      <CreativeStudio
        services={brain.services.map((s) => `${s.name}${yen(s.price)}`)}
        targets={[audience, ...brain.personas.map((p) => p.name)].filter(Boolean)}
        defaultMessage={brain.targetAudience.painPoints.length ? `${brain.targetAudience.painPoints.slice(0, 2).join("、")}に悩んでいる。` : ""}
      />
    </>
  );
}
