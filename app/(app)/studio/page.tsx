import Link from "next/link";
import { requireAppContext } from "@/lib/auth/context";
import { getHypothesisContext, loadAdsPageData, loadCreativeLearnings } from "@/lib/ads/app";
import { rankCreativeLearnings } from "@/lib/ads/creative-memory";
import { aggregate, fmtNum, fmtPct, fmtYen, windowRows } from "@/lib/ads/metrics";
import { PageHeading } from "@/components/ui/page-heading";
import { CreativeStudio } from "@/components/studio/creative-studio";
import { CreativeLab } from "@/components/ads/creative-lab";
import { variableLabel } from "@/components/ads/ui";

export const metadata = { title: "Creative Studio" };

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ hypothesis?: string }> }) {
  const app = await requireAppContext();
  const { brain } = app;
  const q = await searchParams;
  const hypothesisId = q.hypothesis && /^[A-Za-z0-9_-]{1,64}$/.test(q.hypothesis) ? q.hypothesis : null;

  if (hypothesisId) {
    const [h, data, learnings] = await Promise.all([getHypothesisContext(app, hypothesisId), loadAdsPageData(app), loadCreativeLearnings(app)]);
    if (!h) {
      return (
        <>
          <PageHeading eyebrow="広告クリエイティブ" title="Creative Studio" description="仮説が見つかりませんでした。" />
          <Link className="button" href="/ads">広告ダッシュボードへ</Link>
        </>
      );
    }
    const snaps = data.ws.snapshots.filter((s) => s.entityType === "ad" && s.entityId === h.hypothesis.adId);
    const m = data.ws.end ? aggregate(windowRows(snaps, data.ws.end, 14)) : null;
    const recruit = h.hypothesis.goal === "recruitment";
    const memory = rankCreativeLearnings(learnings, { goal: h.hypothesis.goal, persona: h.persona, painPoint: h.painPoint, locationId: h.hypothesis.locationId }).slice(0, 3);
    const existing = data.experiments.find((e) => e.hypothesisId === h.hypothesis.id && e.status !== "cancelled");
    return (
      <>
        <PageHeading
          eyebrow="広告クリエイティブ · 仮説から作成"
          title="Creative Studio"
          description={`${h.campaignName} / ${h.controlAdName} の改善案。仮説 → Brief → B / C 案 → 人のレビュー → A/Bテスト。`}
          actions={<Link className="button" href="/ads">← ダッシュボード</Link>}
        />
        <CreativeLab
          readOnly={app.current.role === "viewer"}
          ctx={{
            hypothesisId: h.hypothesis.id,
            status: h.hypothesis.status,
            goal: h.hypothesis.goal,
            brandName: brain.brandName || brain.companyName,
            locationName: h.locationName,
            campaignName: h.campaignName,
            adSetName: h.adSetName,
            persona: h.persona,
            painPoint: h.painPoint,
            problem: h.hypothesis.problem,
            hypothesis: h.hypothesis.hypothesis,
            variable: h.hypothesis.changeVariable,
            testIdea: h.hypothesis.testIdea,
            expectedResult: h.hypothesis.expectedResult,
            primaryMetricLabel: recruit ? "応募単価" : h.hypothesis.primaryMetric.toUpperCase(),
            landingPageUrl: h.landingPageUrl,
            control: h.control ? { hook: h.control.hook, headline: h.control.headline, primaryText: h.control.primaryText, cta: h.control.cta, angle: h.control.angle, format: h.control.format } : null,
            performance: m
              ? [
                  { label: "費用", value: fmtYen(m.spend) },
                  { label: "CTR", value: fmtPct(m.ctr) },
                  { label: recruit ? "応募率" : "CVR", value: fmtPct(m.cvr) },
                  { label: recruit ? "応募単価" : "CPA", value: fmtYen(m.cpa) },
                  { label: "Frequency", value: fmtNum(m.frequency, 2) },
                ]
              : [],
            memory: memory.map((l) => (l.attributes?.principle ? `${l.attributes.principle}（${l.learning.slice(0, 50)}…）` : l.learning)),
            existingExperiment: existing ? { id: existing.id, status: existing.status } : null,
          }}
          drafts={h.drafts.map((d) => ({ id: d.id, status: d.status, hook: d.hook, headline: d.headline, primaryText: d.primaryText, cta: d.cta, firstViewCopy: d.firstViewCopy, visualDirection: d.visualDirection, angle: d.angle, videoScript: d.videoScript, rejectedReason: d.rejectedReason, aiProvider: d.aiProvider, brief: d.brief }))}
        />
      </>
    );
  }

  const yen = (n: number | null) => (n === null ? "" : ` ¥${n.toLocaleString("ja-JP")}`);
  const audience = brain.targetAudience.summary || [brain.targetAudience.ageRange, brain.targetAudience.occupation].filter(Boolean).join("・");
  const data = await loadAdsPageData(app);
  const hypotheses = (await data.ctx.reader.listHypotheses(data.ctx.organizationId)).filter((h) => (h.status === "proposed" || h.status === "accepted") && h.changeVariable !== "landing_page");
  return (
    <>
      <PageHeading eyebrow="広告クリエイティブ" title="Creative Studio" description="お店の強みとターゲットから、広告コンセプトをつくります。広告データの仮説から作ることもできます。" />
      {hypotheses.length > 0 && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-title" style={{ marginBottom: 6 }}>AIの仮説から作る（入力不要）</div>
          {hypotheses.slice(0, 5).map((h) => (
            <div className="rec-item" key={h.id}>
              <div>
                <h4>{h.hypothesis}</h4>
                <p>{h.problem} ・ 変える変数: {variableLabel(h.changeVariable)}</p>
              </div>
              <Link className="button small primary" href={`/studio?hypothesis=${h.id}`}>✧ Creative案を作る</Link>
            </div>
          ))}
        </div>
      )}
      <CreativeStudio
        services={brain.services.map((s) => `${s.name}${yen(s.price)}`)}
        targets={[audience, ...brain.personas.map((p) => p.name)].filter(Boolean)}
        defaultMessage={brain.targetAudience.painPoints[0] ?? ""}
      />
    </>
  );
}
