import Link from "next/link";
import { requireAppContext } from "@/lib/auth/context";
import { goalLabel, PLATFORM_LABELS } from "@/lib/domain/labels";
import { pillarLabel } from "@/lib/brand/content-pillars";
import { getSocialContext } from "@/lib/social/access";
import { canAccessLocation } from "@/lib/social/access";
import { PageHeading } from "@/components/ui/page-heading";
import { EmptyState } from "@/components/ui/states";
import { LearningStatusButton } from "@/components/social/learning-status-button";

/**
 * Marketing Memory = what real operations taught us (content_learnings),
 * kept separate from Brand Brain (what we know about the company).
 */
export default async function MemoryPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const app = await requireAppContext();
  const ctx = await getSocialContext(app);
  const show = (await searchParams).show === "archived" ? "archived" : "active";
  const [learnings, accounts, locations, posts] = await Promise.all([
    ctx.reader.listLearnings(ctx.organizationId),
    app.repo.listAccounts(ctx.organizationId),
    app.repo.listLocationProfiles(ctx.organizationId),
    app.repo.listPosts(ctx.organizationId),
  ]);
  const visible = learnings.filter((l) => l.status === show && (canAccessLocation(ctx, l.locationId) || l.locationId === null));
  const locName = (id: string | null) => (id ? (locations.find((l) => l.locationId === id)?.locationName ?? "店舗") : "全店舗・本部");
  return (
    <>
      <PageHeading eyebrow="AI" title="Marketing Memory"
        description="実際の投稿データからAIが学んだことの記録です。月間計画・AI投稿作成・Creative Studio・AIマーケターは、Brand Brainに加えてこの学びを参照して次の企画を改善します。" />
      <section className="content-grid" style={{ marginTop: 0, marginBottom: 14 }}>
        <div className="recommendation-callout">
          <b>Brand Brain</b>：会社について「知っていること」（例：ターゲットは30代女性）<br />
          <b>Marketing Memory</b>：実際に運用して「学んだこと」（例：渋谷院Instagramでは肩こりHow-to ReelがBefore/Afterより保存率が高い）
        </div>
        <div className="recommendation-callout">
          Plan → Create → Approve → Publish → Measure → <b>Analyze → Learn</b> → Next Plan<br />
          学びは確度（confidence）つきで保存され、確度の高いものほど企画に優先的に反映されます。古くなった学びはアーカイブできます。
        </div>
      </section>
      <div className="tabs" role="tablist">
        <Link role="tab" aria-selected={show === "active"} className={`tab ${show === "active" ? "active" : ""}`} href="/memory">有効な学び <span>{learnings.filter((l) => l.status === "active").length}</span></Link>
        <Link role="tab" aria-selected={show === "archived"} className={`tab ${show === "archived" ? "active" : ""}`} href="/memory?show=archived">アーカイブ <span>{learnings.filter((l) => l.status === "archived").length}</span></Link>
      </div>
      {visible.length ? (
        <div className="account-grid">
          {visible.map((l) => {
            const account = accounts.find((a) => a.id === l.socialAccountId);
            const sources = l.sourcePostIds.map((id) => posts.find((p) => p.id === id)?.title).filter(Boolean);
            return (
              <article className={`memory-card ${l.status}`} key={l.id}>
                <div className="memory-meta">
                  <span className="loc-pill">{locName(l.locationId)}</span>
                  {l.platform && <span className="loc-pill">{PLATFORM_LABELS[l.platform]}{account ? ` ${account.handle}` : ""}</span>}
                  {l.goal && <span className={`goal-pill ${l.goal}`}>{goalLabel(l.goal)}</span>}
                  {l.contentPillar && <span className="loc-pill">柱：{pillarLabel(l.contentPillar)}</span>}
                </div>
                <h3>{l.learning}</h3>
                {l.result && <div className="strategy-line"><b>結果</b>{l.result}</div>}
                {l.hypothesis && <div className="strategy-line"><b>仮説</b>{l.hypothesis}</div>}
                {sources.length > 0 && <div className="strategy-line"><b>根拠</b>{sources.join("、")}</div>}
                <div className="memory-meta">
                  確度 <span className="confidence-bar"><i style={{ width: `${Math.round(l.confidence * 100)}%` }} /></span> {Math.round(l.confidence * 100)}% · {l.validFrom}〜{l.validUntil ?? ""}
                  {app.current.role !== "viewer" && <span style={{ marginLeft: "auto" }}><LearningStatusButton id={l.id} status={l.status} /></span>}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel">
          <EmptyState icon="❖" title={show === "active" ? "まだ学びはありません" : "アーカイブはありません"}
            description="投稿を公開すると、3日後にAIが成果を分析し、学びをここに保存します。" action={{ label: "成果分析を見る", href: "/performance" }} />
        </div>
      )}
    </>
  );
}
