import Link from "next/link";
import { requireAppContext } from "@/lib/auth/context";
import { jstDateKey, parseMonth, shiftMonth } from "@/lib/domain/dates";
import { PageHeading } from "@/components/ui/page-heading";
import { EmptyState } from "@/components/ui/states";
import { PlannerCalendar } from "@/components/posts/planner-calendar";
import { PLATFORM_ICONS, PLATFORM_LABELS } from "@/lib/domain/labels";
import type { SocialPlatform } from "@/lib/domain/types";

export default async function PlannerPage({ searchParams }: { searchParams: Promise<{ month?: string; highlight?: string }> }) {
  const { repo, current, brain } = await requireAppContext();
  const params = await searchParams;
  const { year, month } = parseMonth(params.month);
  const posts = await repo.listPosts(current.organization.id);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const inMonth = posts.filter((p) => p.scheduledAt && jstDateKey(new Date(p.scheduledAt)).startsWith(monthKey));
  const unscheduled = posts.filter((p) => !p.scheduledAt);
  const scheduledCount = inMonth.filter((p) => p.status === "scheduled" || p.status === "published").length;
  const target = 12;
  const accounts = (Object.entries(brain.social) as [SocialPlatform, string][]).filter(([, handle]) => handle);

  return (
    <>
      <PageHeading
        eyebrow="SNS 運用"
        title="投稿カレンダー"
        description="投稿の計画から公開まで、ひとつの場所で。"
        actions={
          <>
            <Link className="button" href="/chat">✳ AIに投稿計画を相談</Link>
            <Link className="button primary" href="/creator">＋ 投稿を作成</Link>
          </>
        }
      />
      <div className="panel calendar-panel" style={{ position: "relative" }}>
        <div className="calendar-toolbar">
          <div className="month-control">
            <Link className="arrow-button" style={{ display: "grid", placeItems: "center", textDecoration: "none" }}
              href={`/planner?month=${shiftMonth({ year, month }, -1)}`} aria-label="前の月">‹</Link>
            <b>{year}年{month}月</b>
            <Link className="arrow-button" style={{ display: "grid", placeItems: "center", textDecoration: "none" }}
              href={`/planner?month=${shiftMonth({ year, month }, 1)}`} aria-label="次の月">›</Link>
            <Link className="button small" href="/planner">今日</Link>
          </div>
        </div>
        <PlannerCalendar posts={posts} year={year} month={month} todayKey={jstDateKey(new Date())} highlightId={params.highlight} />
        {posts.length === 0 && (
          <div style={{ marginTop: 14 }}>
            <EmptyState icon="▦" title="まだ投稿がありません" description="AI投稿作成で最初の投稿をつくり、「SNS Plannerへ追加」するとここに表示されます。日付をクリックしてその日の投稿を作ることもできます。"
              action={{ label: "AIで投稿を作成", href: "/creator" }} />
          </div>
        )}
      </div>
      <section className="lower-grid">
        <div className="panel section-spacer">
          <div className="panel-heading">
            <div>
              <div className="panel-title">今月の投稿目標</div>
              <div className="panel-subtitle">{brain.socialGoals || "ブランドの目的に合わせた投稿バランス"}</div>
            </div>
            <span className="priority-tag">達成率 {Math.min(100, Math.round((scheduledCount / target) * 100))}%</span>
          </div>
          <div className="metric-foot">予約・公開済み {scheduledCount} / {target}本 · 下書き {inMonth.length - scheduledCount}本 · 日時未定 {unscheduled.length}本</div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(100, (scheduledCount / target) * 100)}%` }} /></div>
        </div>
        <div className="panel section-spacer">
          <div className="panel-title">SNSアカウント</div>
          {accounts.length ? (
            accounts.map(([platform, handle]) => (
              <div className="campaign-row" key={platform}>
                <span className={`platform-dot ${platform === "threads" ? "threads" : platform === "tiktok" ? "tiktok" : ""}`}>{PLATFORM_ICONS[platform]}</span>
                <div className="row-main"><b>{PLATFORM_LABELS[platform]}</b><small>{handle}</small></div>
                <span className="status-pill draft">未連携</span>
              </div>
            ))
          ) : (
            <p className="activity-note" style={{ marginTop: 10 }}>Brand BrainでSNSアカウントを登録できます。</p>
          )}
          <p className="not-connected">API連携（自動投稿・インサイト取得）は今後対応予定です。</p>
        </div>
      </section>
    </>
  );
}
