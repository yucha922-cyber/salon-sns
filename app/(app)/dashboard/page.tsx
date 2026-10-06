import Link from "next/link";
import { requireAppContext } from "@/lib/auth/context";
import { getCampaigns, getDashboardMetrics } from "@/lib/services/analytics";
import { upcomingPosts } from "@/lib/domain/posts";
import { brandBrainCompleteness } from "@/lib/brand/context";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/domain/labels";
import { PageHeading } from "@/components/ui/page-heading";
import { MetricCard } from "@/components/ui/metric-card";
import { TrendChart } from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/states";
import { PostRow } from "@/components/posts/post-row";
import { ScopeSelect } from "@/components/planning/scope-select";
import { RecommendationList } from "@/components/recommendations/recommendation-list";
import { computeOperationsOverview, parseScope } from "@/lib/services/operations";
import { goalLabel, PLATFORM_LABELS } from "@/lib/domain/labels";

function greeting(hour: number) {
  if (hour < 11) return "おはようございます";
  if (hour < 18) return "こんにちは";
  return "こんばんは";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { user, repo, current, brain } = await requireAppContext();
  const org = current.organization;
  const scopeParam = (await searchParams).scope ?? "all";
  const scope = parseScope(scopeParam);
  const [allPosts, accounts, locationProfiles, hqCampaigns, recommendations] = await Promise.all([
    repo.listPosts(org.id),
    repo.listAccounts(org.id),
    repo.listLocationProfiles(org.id),
    repo.listHqCampaigns(org.id),
    repo.listRecommendations(org.id),
  ]);
  const ops = computeOperationsOverview({ accounts, locations: locationProfiles, posts: allPosts, campaigns: hqCampaigns }, scope);
  const posts = allPosts.filter(
    (p) => scope.kind === "all" || (scope.kind === "location" ? p.locationId === scope.id : p.accountId === scope.id),
  );
  const scopedRecommendations = recommendations.filter(
    (r) => scope.kind === "all" || (scope.kind === "location" ? r.locationId === scope.id : r.socialAccountId === scope.id),
  );
  const accountLabels = Object.fromEntries(accounts.map((a) => [a.id, a.handle]));
  const locations = locationProfiles.map((l) => ({ id: l.locationId, name: l.locationName }));
  const metrics = getDashboardMetrics(org, posts);
  const campaigns = getCampaigns(org).slice(0, 3);
  const upcoming = upcomingPosts(posts);
  const completeness = brandBrainCompleteness(brain);
  const now = new Date();
  const jstHour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Tokyo" }).format(now));
  const dateLabel = new Intl.DateTimeFormat("ja-JP", { weekday: "long", month: "long", day: "numeric", timeZone: "Asia/Tokyo" }).format(now);
  const firstName = user.displayName.split(/\s+/).pop() ?? user.displayName;
  const pain = brain.targetAudience.painPoints[0];
  const strength = brain.strengths[0];
  const fmt = (n: number) => new Intl.NumberFormat("ja-JP").format(n);

  return (
    <>
      <PageHeading
        eyebrow={dateLabel}
        title={`${greeting(jstHour)}、${firstName}さん`}
        description="今日もAIマーケターと一緒に、集客を一歩前へ。"
        actions={
          <>
            <Link className="button" href="/chat">✳ AIに相談</Link>
            <Link className="button primary" href="/creator"><span className="plus">＋</span> 投稿を作成</Link>
          </>
        }
      />

      <ScopeSelect value={scopeParam} locations={locations} accounts={accounts} />
      <section className="ops-grid" aria-label="本部運用サマリー">
        {[
          ["運用店舗", `${ops.activeLocations}`],
          ["運用アカウント", `${ops.activeAccounts}`],
          ["集客アカウント", `${ops.acquisitionAccounts}`],
          ["採用アカウント", `${ops.recruitmentAccounts}`],
          ["今月の予定投稿", `${ops.plannedThisMonth}本`],
          ["予約済み（承認済）", `${ops.approvedThisMonth}本`],
          ["下書き・企画", `${ops.draftThisMonth}本`],
        ].map(([label, value]) => (
          <div className="ops-card" key={label}><span>{label}</span><b>{value}</b></div>
        ))}
      </section>
      <section className="content-grid" style={{ marginTop: 0, marginBottom: 16 }}>
        <div className="panel">
          <div className="panel-heading">
            <div><div className="panel-title">店舗別ステータス</div><div className="panel-subtitle">{ops.month.replace("-", "年")}月の計画状況（アカウント戦略の投稿頻度に対する予定本数）</div></div>
            <Link className="button small" href={`/planner${scopeParam !== "all" ? `?scope=${scopeParam}` : ""}`}>計画を見る →</Link>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>店舗 / アカウント</th><th>目的</th><th>予定 / 目標</th><th>計画進捗</th><th>下書き</th></tr></thead>
              <tbody>
                {ops.locations.flatMap((loc) => [
                  <tr key={`loc-${loc.locationId ?? "hq"}`}>
                    <td><b>{loc.name}</b></td><td className="table-muted">{loc.accounts.length}アカウント</td>
                    <td className="table-strong">{loc.planned} / {loc.monthlyTarget}</td>
                    <td><div className="coverage-bar"><i className={loc.monthlyTarget && loc.planned / loc.monthlyTarget < 0.5 ? "low" : ""} style={{ width: `${Math.min(100, loc.monthlyTarget ? (loc.planned / loc.monthlyTarget) * 100 : 100)}%` }} /></div></td>
                    <td className="table-muted">{loc.drafts}</td>
                  </tr>,
                  ...loc.accounts.map((s) => (
                    <tr key={s.account.id}>
                      <td className="table-muted">└ {PLATFORM_LABELS[s.account.platform]} {s.account.handle}{s.account.active ? "" : "（停止中）"}</td>
                      <td><span className={`goal-pill ${s.account.goal}`}>{goalLabel(s.account.goal, s.account.customGoal)}</span></td>
                      <td>{s.planned} / {s.monthlyTarget}</td>
                      <td><div className="coverage-bar"><i className={s.coverage < 0.5 ? "low" : ""} style={{ width: `${Math.min(100, s.coverage * 100)}%` }} /></div></td>
                      <td className="table-muted">{s.drafts}</td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <div className="panel-heading">
            <div><div className="panel-title">✳ AI Recommendation</div><div className="panel-subtitle">承認待ちの改善提案</div></div>
            <Link className="button small" href="/analysis">すべて見る →</Link>
          </div>
          <RecommendationList recommendations={scopedRecommendations} accountLabels={accountLabels} readOnly={current.role === "viewer"} compact limit={3} />
          <div className="panel-title" style={{ margin: "14px 0 6px" }}>本部キャンペーン</div>
          {ops.activeCampaigns.length ? (
            ops.activeCampaigns.slice(0, 2).map((c) => (
              <div className="campaign-row" key={c.id}>
                <span className="campaign-indicator" />
                <div className="row-main"><b>{c.name}</b><small>{c.startsOn ?? ""}〜{c.endsOn ?? ""} · {c.targetLocationIds.length ? `${c.targetLocationIds.length}店舗` : "全店舗"}</small></div>
                <Link className="button small" href="/hq">詳細</Link>
              </div>
            ))
          ) : (
            <p className="activity-note">実施中の本部キャンペーンはありません。<Link className="link-button" href="/hq">作成する</Link></p>
          )}
        </div>
      </section>

      <section className={`metric-grid ${metrics.ads ? "five" : ""}`}>
        {metrics.sns.map((m) => (
          <MetricCard key={m.label} metric={m} note={m.value === "—" ? "SNS連携後に表示されます" : "Brand Brainの投稿データ"} />
        ))}
        {metrics.ads?.map((m) => <MetricCard key={m.label} metric={m} />)}
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <div className="panel-title">パフォーマンス推移</div>
              <div className="panel-subtitle">SNSリーチと広告クリック数の推移</div>
            </div>
            {org.isDemo && <span className="status-pill draft">デモデータ</span>}
          </div>
          {org.isDemo ? (
            <>
              <TrendChart />
              <div className="chart-legend">
                <span><i className="legend-dot" />SNSリーチ</span>
                <span><i className="legend-dot orange" />広告クリック</span>
              </div>
            </>
          ) : (
            <EmptyState
              icon="◉"
              title="SNS・広告アカウントは未連携です"
              description="Instagram / Meta広告の連携後、リーチやクリックの推移がここに表示されます。それまでは投稿の計画と作成から始めましょう。"
              action={{ label: "投稿カレンダーを開く", href: "/planner" }}
            />
          )}
        </div>
        <article className="insight-card">
          <div className="insight-label"><span className="spark">✳</span> AIからの今日の提案</div>
          {org.isDemo ? (
            <>
              <h3>「姿勢リセット」投稿の保存率が高まっています</h3>
              <p>
                直近のリール投稿は平均より保存率が<strong>32%高い</strong>結果です。今週はデスクワーカー向けHow-to投稿をあと2本増やし、プロフィールへの導線を強化しましょう。
              </p>
            </>
          ) : (
            <>
              <h3>{pain ? `「${pain}」に悩む方へのHow-to投稿から始めましょう` : "最初の投稿テーマをAIと決めましょう"}</h3>
              <p>
                Brand Brainをもとに、{brain.targetAudience.occupation || "ターゲット"}向けに
                {strength ? `「${strength}」を伝える` : "お店の強みを伝える"}投稿を週2〜3本から始めるのがおすすめです。
              </p>
            </>
          )}
          <div className="insight-footer">
            <span className="confidence">Brand Brain 完成度 {completeness.score}%</span>
            <span className="priority-tag">今週のおすすめ</span>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="button small soft" href="/chat">AIマーケターに相談 →</Link>
            {completeness.missing.length > 0 && (
              <Link className="button small" href="/brand">Brand Brainを充実させる</Link>
            )}
          </div>
        </article>
      </section>

      <section className="lower-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <div className="panel-title">次の投稿</div>
              <div className="panel-subtitle">公開予定のコンテンツ</div>
            </div>
            <Link className="button small" href="/planner">カレンダーを見る →</Link>
          </div>
          {upcoming.length ? (
            <div className="mini-list">{upcoming.map((p, i) => <PostRow key={p.id} post={p} index={i} />)}</div>
          ) : (
            <EmptyState icon="▦" title="予定されている投稿はありません" description="AI投稿作成で投稿をつくり、カレンダーに追加しましょう。"
              action={{ label: "AIで投稿を作成", href: "/creator" }} />
          )}
        </div>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <div className="panel-title">広告キャンペーン</div>
              <div className="panel-subtitle">今月の配信状況</div>
            </div>
            <Link className="button small" href="/ads">すべて見る →</Link>
          </div>
          {campaigns.length ? (
            campaigns.map((c) => (
              <div className="campaign-row" key={c.id}>
                <span className={`campaign-indicator ${c.status === "paused" ? "paused" : ""}`} />
                <div className="row-main">
                  <b>{c.name}</b>
                  <small>{CAMPAIGN_STATUS_LABELS[c.status]} · CTR {c.ctr}%</small>
                </div>
                <div className="campaign-stats">
                  ¥{fmt(c.spend)}
                  <br />
                  <b>{c.roas}x ROAS</b>
                </div>
              </div>
            ))
          ) : (
            <EmptyState icon="⌁" title="Meta広告は未連携です" description="広告アカウントの連携は今後のアップデートで対応します。広告案づくりはCreative Studioで試せます。"
              action={{ label: "Creative Studioへ", href: "/studio" }} />
          )}
        </div>
      </section>
    </>
  );
}
