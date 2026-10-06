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
import { filterByLocation, getSocialContext } from "@/lib/social/access";
import { computeAttention, computeCrossLocation, computePerformanceOverview } from "@/lib/social/analytics";
import { runDemoTickIfDue } from "@/lib/social/demo-tick";
import { formatNumber, formatPercent } from "@/lib/social/metrics";

function greeting(hour: number) {
  if (hour < 11) return "おはようございます";
  if (hour < 18) return "こんにちは";
  return "こんばんは";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const app = await requireAppContext();
  const { user, repo, current, brain } = app;
  const org = current.organization;
  const social = await getSocialContext(app);
  await runDemoTickIfDue(org.id, repo);
  const scopeParam = (await searchParams).scope ?? "all";
  const scope = parseScope(scopeParam);
  const [allPosts, allAccounts, locationProfiles, hqCampaigns, recommendations, snapshots, jobs] = await Promise.all([
    repo.listPosts(org.id),
    repo.listAccounts(org.id),
    repo.listLocationProfiles(org.id),
    repo.listHqCampaigns(org.id),
    repo.listRecommendations(org.id),
    social.reader.listSnapshots(org.id, { since: new Date(Date.now() - 62 * 86_400_000).toISOString() }).catch(() => []),
    social.reader.listJobs(org.id, { statuses: ["failed"], limit: 50 }).catch(() => []),
  ]);
  const topLearning = (await social.reader.listLearnings(org.id, { status: "active" }).catch(() => []))
    .filter((l) => social.locationIds === null || l.locationId === null || social.locationIds.includes(l.locationId))
    .sort((a, b) => b.confidence - a.confidence)[0];
  // Location managers only see their own locations.
  const accounts = filterByLocation(social, allAccounts);
  const ops = computeOperationsOverview({ accounts, locations: locationProfiles, posts: allPosts, campaigns: hqCampaigns }, scope);
  const posts = allPosts.filter(
    (p) => scope.kind === "all" || (scope.kind === "location" ? p.locationId === scope.id : p.accountId === scope.id),
  );
  const scopedRecommendations = recommendations.filter(
    (r) => scope.kind === "all" || (scope.kind === "location" ? r.locationId === scope.id : r.socialAccountId === scope.id),
  );
  const accountLabels = Object.fromEntries(accounts.map((a) => [a.id, a.handle]));
  const locations = locationProfiles.map((l) => ({ id: l.locationId, name: l.locationName }));
  const scopedAccounts = accounts.filter((a) => scope.kind === "all" || (scope.kind === "location" ? a.locationId === scope.id : a.id === scope.id));
  const analyticsInput = { posts, accounts: scopedAccounts, locations: locationProfiles, snapshots, jobs: filterByLocation(social, jobs), recommendations: scopedRecommendations };
  const performance = computePerformanceOverview(analyticsInput);
  const attention = computeAttention(analyticsInput).filter((i) => i.kind !== "info" || i.href !== "/analysis");
  const crossLocation = computeCrossLocation(analyticsInput);
  const metrics = getDashboardMetrics(org, posts, performance);
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

      <ScopeSelect value={scopeParam} locations={locations.filter((l) => social.locationIds === null || social.locationIds.includes(l.id))} accounts={accounts} />
      <section className="content-grid" style={{ marginTop: 0, marginBottom: 16 }}>
        <div className="panel">
          <div className="panel-heading">
            <div><div className="panel-title">要対応（問題・チャンス）</div><div className="panel-subtitle">全店舗を毎日見なくても、確認が必要なものだけを上位に表示します</div></div>
            <Link className="button small" href="/publishing">Publish Queue →</Link>
          </div>
          {attention.length ? (
            <div className="attention-list">
              {attention.slice(0, 6).map((item, i) => (
                <Link key={`${item.title}-${i}`} href={item.href} className={`attention-item ${item.kind}`}>
                  <span className="dot">{item.kind === "problem" ? "!" : item.kind === "opportunity" ? "↑" : "i"}</span>
                  <span><b>{item.title}</b><small>{item.detail}</small></span>
                  <span className="activity-note">→</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="activity-note">いま対応が必要な問題はありません。</p>
          )}
        </div>
        <div className="panel">
          <div className="panel-heading"><div><div className="panel-title">運用ループ</div><div className="panel-subtitle">Plan → Create → Approve → Publish → Measure → Analyze → Learn</div></div></div>
          <div className="metric-row">
            <div className="metric-mini"><span>予約・処理中</span><b>{allPosts.filter((p) => p.status === "queued" || p.status === "publishing").length}本</b><small><Link className="link-button" href="/publishing">Publish Queue</Link></small></div>
            <div className="metric-mini"><span>承認待ち（予定）</span><b>{allPosts.filter((p) => p.status === "scheduled" || p.status === "approved").length}本</b><small><Link className="link-button" href="/planner">カレンダー</Link></small></div>
            <div className="metric-mini"><span>計測済み投稿（30日）</span><b>{performance.measuredCount}本</b><small><Link className="link-button" href="/performance">成果分析</Link></small></div>
          </div>
        </div>
      </section>
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

      <section className="panel" style={{ marginBottom: 16 }} aria-label="店舗横断パフォーマンス">
        <div className="panel-heading">
          <div><div className="panel-title">店舗横断パフォーマンス（直近30日）</div><div className="panel-subtitle">どの店舗・アカウントを見るべきかを一覧で確認できます</div></div>
          <Link className="button small" href="/performance">成果分析 →</Link>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>店舗</th><th>Platform</th><th>目的</th><th>投稿</th><th>Reach/閲覧</th><th>ER</th><th>Growth</th><th>Top Content</th><th>Warnings</th><th>AI提案</th></tr></thead>
            <tbody>
              {crossLocation.map((r) => (
                <tr key={r.account.id}>
                  <td><b>{r.locationName}</b></td>
                  <td>{PLATFORM_LABELS[r.account.platform]} <span className="table-muted">{r.account.handle}</span></td>
                  <td><span className={`goal-pill ${r.account.goal}`}>{r.goalLabel}</span></td>
                  <td>{r.posts}</td>
                  <td>{formatNumber(r.reach)}</td>
                  <td>{formatPercent(r.engagementRate)}</td>
                  <td className={(r.growth ?? 0) >= 0 ? "table-strong" : ""}>{r.growth === undefined ? "—" : `${r.growth >= 0 ? "+" : ""}${formatNumber(r.growth)}`}</td>
                  <td className="table-muted" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{r.topContent ?? "—"}</td>
                  <td>{r.warnings ? <span className="status-pill failed">{r.warnings}</span> : <span className="table-muted">0</span>}</td>
                  <td>{r.recommendations || <span className="table-muted">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {performance.insufficient && <p className="activity-note" style={{ marginTop: 8 }}>insufficient data：計測済みの投稿が少ないため、平均との比較は参考値です。</p>}
      </section>

      <section className={`metric-grid ${metrics.ads ? "five" : ""}`}>
        {metrics.sns.map((m) => (
          <MetricCard key={m.label} metric={m} note={m.value === "—" ? "SNS連携・計測後に表示されます" : performance.measuredCount ? "Instagram / Threads Insights（直近30日）" : "Brand Brainの投稿データ"} />
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
          {topLearning ? (
            <>
              <h3>{topLearning.learning}</h3>
              <p>
                {topLearning.hypothesis ? `仮説：${topLearning.hypothesis}。` : ""}この学びはMarketing Memoryに保存され、次の月間計画・投稿作成に反映されます。
              </p>
            </>
          ) : org.isDemo ? (
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
            <span className="confidence">{topLearning ? `Marketing Memory · 確度 ${Math.round(topLearning.confidence * 100)}%` : `Brand Brain 完成度 ${completeness.score}%`}</span>
            <span className="priority-tag">今週のおすすめ</span>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="button small soft" href="/chat">AIマーケターに相談 →</Link>
            {topLearning && <Link className="button small" href="/memory">Marketing Memory</Link>}
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
