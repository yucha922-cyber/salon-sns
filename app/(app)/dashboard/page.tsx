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

function greeting(hour: number) {
  if (hour < 11) return "おはようございます";
  if (hour < 18) return "こんにちは";
  return "こんばんは";
}

export default async function DashboardPage() {
  const { user, repo, current, brain } = await requireAppContext();
  const org = current.organization;
  const posts = await repo.listPosts(org.id);
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

      <section className="metric-grid">
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
