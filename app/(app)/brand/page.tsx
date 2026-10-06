import { requireAppContext } from "@/lib/auth/context";
import { toBrandBrainInput } from "@/lib/brand/defaults";
import { findIndustryPreset } from "@/lib/brand/industries";
import { PageHeading } from "@/components/ui/page-heading";
import { BrandBrainEditor } from "@/components/brand/brand-brain-editor";

export default async function BrandPage() {
  const { brain, current } = await requireAppContext();
  return (
    <>
      <PageHeading eyebrow="ブランド情報" title="Brand Brain"
        description="AIがあなたのお店を理解するための知識ベース。ここで保存した内容は、AIマーケター・投稿作成・Creative Studio・広告分析のすべてに反映されます。" />
      <BrandBrainEditor
        initial={toBrandBrainInput(brain)}
        updatedAt={brain.updatedAt}
        readOnly={current.role === "viewer"}
        industryGuide={findIndustryPreset(brain.industry.key)?.aiGuide ?? null}
      />
    </>
  );
}
