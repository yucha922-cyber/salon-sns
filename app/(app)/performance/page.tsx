import Link from "next/link";
import { requireAppContext } from "@/lib/auth/context";
import { PLATFORM_LABELS } from "@/lib/domain/labels";
import { formatInZone } from "@/lib/domain/timezone";
import { pillarLabel } from "@/lib/brand/content-pillars";
import { filterByLocation, getSocialContext } from "@/lib/social/access";
import { computePerformanceOverview, type GroupPerformance, type PostPerformance } from "@/lib/social/analytics";
import { runDemoTickIfDue } from "@/lib/social/demo-tick";
import { formatNumber, formatPercent, formatSignedPercent, GOAL_KPIS, MIN_SAMPLE } from "@/lib/social/metrics";
import { parseScope } from "@/lib/services/operations";
import { PageHeading } from "@/components/ui/page-heading";
import { ScopeSelect } from "@/components/planning/scope-select";

type GoalTab = "all" | "acquisition" | "recruitment" | "branding";
const GOAL_TABS: { key: GoalTab; label: string; note: string }[] = [
  { key: "all", label: "すべて", note: "全アカウントの合計" },
  { key: "acquisition", label: "集客", note: "評価軸：保存率・プロフィールアクセス・リンククリック → 予約" },
  { key: "recruitment", label: "採用", note: "評価軸：プロフィール遷移・採用ページクリック → 応募" },
  { key: "branding", label: "ブランド", note: "評価軸：リーチ・閲覧・エンゲージメント・フォロワー" },
];

function GroupTable({ title, rows, showSave }: { title: string; rows: GroupPerformance[]; showSave: boolean }) {
  return (
    <div className="panel">
      <div className="panel-title" style={{ marginBottom: 8 }}>{title}</div>
      {rows.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>{title.replace("別", "")}</th><th>投稿</th><th>リーチ/閲覧</th><th>ER</th>{showSave && <th>保存率</th>}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="table-strong">{r.label}</td>
                  <td>{r.posts}</td>
                  <td>{formatNumber(r.reach ?? r.views)}</td>
                  <td>{formatPercent(r.engagementRate)}</td>
                  {showSave && <td>{formatPercent(r.saveRate)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="activity-note">データがありません</p>
      )}
    </div>
  );
}

function PostList({ rows, tz, empty }: { rows: PostPerformance[]; tz: string; empty: string }) {
  if (!rows.length) return <p className="activity-note">{empty}</p>;
  return (
    <div className="mini-list">
      {rows.map((r) => (
        <div className="post-row" key={r.post.id}>
          <span className={`platform-dot ${r.account.platform === "threads" ? "threads" : ""}`}>{r.account.platform === "threads" ? "@" : "◎"}</span>
          <div className="row-main">
            <b>{r.post.title}</b>
            <small>{r.locationName} · {PLATFORM_LABELS[r.account.platform]} {r.account.handle} · {formatInZone(r.post.publishing.publishedAt ?? r.post.scheduledAt, tz, false)} · 柱：{pillarLabel(r.post.planning.contentPillar || "—")}</small>
          </div>
          <div className="row-meta">
            {r.primaryLabel} <b>{formatPercent(r.primaryRate)}</b>
            <br />
            <small className={(r.vsBaseline ?? 0) >= 0 ? "positive" : "negative"}>{r.vsBaseline === undefined ? "比較データ不足" : `平均比 ${formatSignedPercent(r.vsBaseline)}`}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ goal?: string; scope?: string; days?: string }> }) {
  const app = await requireAppContext();
  const ctx = await getSocialContext(app);
  await runDemoTickIfDue(ctx.organizationId, app.repo);
  const q = await searchParams;
  const goal: GoalTab = (["acquisition", "recruitment", "branding"] as const).find((g) => g === q.goal) ?? "all";
  const days = q.days === "7" ? 7 : q.days === "90" ? 90 : 30;
  const scopeParam = q.scope ?? "all";
  const scope = parseScope(scopeParam);
  const [posts, accountsAll, locations, snapshots, reviews] = await Promise.all([
    app.repo.listPosts(ctx.organizationId),
    app.repo.listAccounts(ctx.organizationId),
    app.repo.listLocationProfiles(ctx.organizationId),
    ctx.reader.listSnapshots(ctx.organizationId, { since: new Date(Date.now() - (days + 31) * 86_400_000).toISOString() }),
    ctx.reader.listReviews(ctx.organizationId, { limit: 6 }),
  ]);
  const accounts = filterByLocation(ctx, accountsAll).filter((a) => scope.kind === "all" || (scope.kind === "location" ? a.locationId === scope.id : a.id === scope.id));
  const overview = computePerformanceOverview({ posts, accounts, locations, snapshots }, { goal, periodDays: days, pillarLabel: (k) => pillarLabel(k) });
  const kpis = goal === "all" ? null : GOAL_KPIS[goal];
  const values: Record<string, string> = {
    reach: formatNumber(overview.totals.reach),
    views: formatNumber(overview.totals.views),
    profileVisits: formatNumber(overview.totals.profileVisits),
    clicks: formatNumber(overview.totals.clicks),
    careerClicks: formatNumber(overview.totals.clicks),
    saveRate: formatPercent(overview.totals.saves !== undefined && overview.totals.reach ? overview.totals.saves / overview.totals.reach : undefined),
    engagementRate: formatPercent(overview.engagementRate),
    followers: overview.followers !== undefined ? `${formatNumber(overview.followers)}${overview.followerGrowth !== undefined ? `（${overview.followerGrowth >= 0 ? "+" : ""}${formatNumber(overview.followerGrowth)}）` : ""}` : "—",
  };
  const link = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams({ ...(goal !== "all" ? { goal } : {}), ...(days !== 30 ? { days: String(days) } : {}), ...(scopeParam !== "all" ? { scope: scopeParam } : {}) });
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `/performance${p.toString() ? `?${p}` : ""}`;
  };
  const showSave = goal !== "recruitment";

  return (
    <>
      <PageHeading eyebrow="SNS" title="成果分析"
        description="Instagram / Threads のInsightsを時系列で保存し、目的（集客・採用・ブランド）ごとの評価軸で振り返ります。AIの分析結果はMarketing Memoryとして次の企画に使われます。"
        actions={<Link className="button" href="/memory">❖ Marketing Memory</Link>} />
      <ScopeSelect value={scopeParam} locations={filterByLocation(ctx, locations.map((l) => ({ ...l, locationId: l.locationId }))).map((l) => ({ id: l.locationId, name: l.locationName }))} accounts={filterByLocation(ctx, accountsAll)} />
      <div className="tabs" role="tablist" style={{ marginTop: 6 }}>
        {GOAL_TABS.map((t) => (
          <Link key={t.key} role="tab" aria-selected={goal === t.key} className={`tab ${goal === t.key ? "active" : ""}`} href={link({ goal: t.key === "all" ? null : t.key })}>{t.label}</Link>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {[7, 30, 90].map((d) => <Link key={d} className={`choice-chip ${days === d ? "selected" : ""}`} href={link({ days: d === 30 ? null : String(d) })}>{d}日</Link>)}
        </span>
      </div>
      <p className="activity-note" style={{ margin: "-6px 0 12px" }}>{GOAL_TABS.find((t) => t.key === goal)?.note} · 直近{days}日で公開 {overview.publishedCount}本（計測済み {overview.measuredCount}本）</p>

      {overview.insufficient ? (
        <div className="insufficient" style={{ marginBottom: 14 }}>
          <b>insufficient data（データ不足）</b>：比較・グラフには計測済みの投稿が{MIN_SAMPLE}本以上必要です（現在 {overview.measuredCount}本）。
          投稿を予約・公開すると、1時間後・24時間後・3日後・7日後…にInsightsが自動で保存されます。
        </div>
      ) : null}

      <section className="metric-row" style={{ marginBottom: 14 }} aria-label="KPI">
        {(kpis ?? [
          { key: "reach", label: "リーチ", source: "api" },
          { key: "views", label: "閲覧数", source: "api" },
          { key: "engagementRate", label: "エンゲージメント率", source: "api" },
          { key: "followers", label: "フォロワー（増減）", source: "api" },
          { key: "profileVisits", label: "プロフィールアクセス", source: "api" },
          { key: "clicks", label: "リンククリック", source: "api" },
        ]).map((k) => (
          <div className={`metric-mini ${k.source === "manual" ? "manual" : ""}`} key={k.key}>
            <span>{k.label}</span>
            <b>{k.source === "manual" ? "—" : (values[k.key] ?? "—")}</b>
            <small>{k.source === "manual" ? "SNS APIでは取得不可（予約・応募データ連携は今後対応）" : `直近${days}日`}</small>
          </div>
        ))}
      </section>

      <section className="content-grid" style={{ marginTop: 0 }}>
        <div className="panel">
          <div className="panel-title" style={{ marginBottom: 6 }}>Top Posts</div>
          <PostList rows={overview.topPosts} tz={ctx.timezone} empty="計測済みの投稿がまだありません" />
          <div className="panel-title" style={{ margin: "14px 0 6px" }}>Worst Posts</div>
          <PostList rows={overview.worstPosts} tz={ctx.timezone} empty="比較できる投稿数が不足しています（4本以上で表示）" />
        </div>
        <div className="panel">
          <div className="panel-title" style={{ marginBottom: 8 }}>✳ 最近のAI Performance Review</div>
          {reviews.length ? (
            reviews.map((r) => {
              const post = posts.find((p) => p.id === r.postId);
              return (
                <div className="review-box" key={r.id} style={{ marginBottom: 8 }}>
                  <b>{post?.title ?? "投稿"}</b>（確度 {Math.round(r.confidence * 100)}%）
                  <p style={{ margin: "3px 0" }}>{r.summary}</p>
                  <small className="activity-note">次の一手：{r.recommendedNextAction}</small>
                </div>
              );
            })
          ) : (
            <p className="activity-note">公開から3日たった投稿は自動でAIが分析します。投稿の詳細から手動でも分析できます。</p>
          )}
        </div>
      </section>

      {!overview.insufficient && (
        <section className="lower-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
          <GroupTable title="コンテンツの柱別" rows={overview.byPillar} showSave={showSave} />
          <GroupTable title="プラットフォーム別" rows={overview.byPlatform} showSave={showSave} />
          <GroupTable title="店舗別" rows={overview.byLocation} showSave={showSave} />
          <GroupTable title="目的別（集客 / 採用）" rows={overview.byGoal} showSave={showSave} />
        </section>
      )}
    </>
  );
}
