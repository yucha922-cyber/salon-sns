import Link from "next/link";
import { requireAppContext } from "@/lib/auth/context";
import { jstDateKey, parseMonth, shiftMonth } from "@/lib/domain/dates";
import { parseScope } from "@/lib/services/operations";
import { PageHeading } from "@/components/ui/page-heading";
import { EmptyState } from "@/components/ui/states";
import { PlannerCalendar } from "@/components/posts/planner-calendar";
import { ScopeSelect } from "@/components/planning/scope-select";
import { MonthlyPlanButton } from "@/components/planning/monthly-plan-dialog";
import { goalLabel, PLATFORM_ICONS, PLATFORM_LABELS } from "@/lib/domain/labels";

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; highlight?: string; scope?: string; account?: string }>;
}) {
  const { repo, current, brain } = await requireAppContext();
  const params = await searchParams;
  const orgId = current.organization.id;
  const scopeParam = params.account ? `acc:${params.account}` : (params.scope ?? "all");
  const scope = parseScope(scopeParam);
  const { year, month } = parseMonth(params.month);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const [allPosts, accounts, campaigns, proposals] = await Promise.all([
    repo.listPosts(orgId),
    repo.listAccounts(orgId),
    repo.listHqCampaigns(orgId),
    repo.listPlanProposals(orgId),
  ]);
  const inScope = (p: { accountId: string | null; locationId: string | null }) =>
    scope.kind === "all" || (scope.kind === "location" ? p.locationId === scope.id : p.accountId === scope.id);
  const posts = allPosts.filter(inScope);
  const scopedAccounts = accounts.filter((a) => a.active && (scope.kind === "all" || (scope.kind === "location" ? a.locationId === scope.id : a.id === scope.id)));
  const inMonth = posts.filter((p) => p.scheduledAt && jstDateKey(new Date(p.scheduledAt)).startsWith(monthKey));
  const unscheduled = posts.filter((p) => !p.scheduledAt);
  const approvedCount = inMonth.filter((p) => p.status === "scheduled" || p.status === "published").length;
  const target = Math.round(scopedAccounts.reduce((n, a) => n + a.strategy.postsPerWeek, 0) * 4.3) || 12;
  const locations = brain.locations.flatMap((l) => (l.id ? [{ id: l.id, name: l.name }] : []));
  const locName = (id: string | null) => (id ? (locations.find((l) => l.id === id)?.name ?? "") : "本部");
  const pendingProposals = proposals.filter((p) => p.status === "pending" || p.status === "partially_approved");
  const thisMonth = jstDateKey(new Date()).slice(0, 7);
  const months = [0, 1, 2].map((d) => shiftMonth(parseMonth(thisMonth), d));
  const q = (extra: string) => `/planner?${[scopeParam !== "all" ? `scope=${scopeParam}` : "", extra].filter(Boolean).join("&")}`;

  return (
    <>
      <PageHeading
        eyebrow="SNS 運用"
        title="投稿カレンダー"
        description="店舗・アカウントごとの月間計画を、AIの企画案と人の承認でつくります。"
        actions={
          <>
            <Link className="button" href="/creator">＋ 投稿を作成</Link>
            <MonthlyPlanButton
              accounts={accounts.filter((a) => a.active)}
              locations={locations}
              campaigns={campaigns.filter((c) => c.status === "active" || c.status === "draft").map((c) => ({ id: c.id, name: c.name, goal: c.goal }))}
              months={months}
              defaultAccountId={
                scope.kind === "account"
                  ? scope.id
                  : ((scopedAccounts.find((a) => a.locationId && a.goal === "acquisition") ?? scopedAccounts[0])?.id ?? "")
              }
              defaultMonth={monthKey}
            />
          </>
        }
      />
      <ScopeSelect value={scopeParam} locations={locations} accounts={accounts} />

      {pendingProposals.length > 0 && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-heading">
            <div><div className="panel-title">AIの企画案（確認待ち）</div><div className="panel-subtitle">承認した企画だけがカレンダーに追加されます</div></div>
          </div>
          {pendingProposals.slice(0, 5).map((p) => {
            const a = accounts.find((x) => x.id === p.accountId);
            return (
              <div className="campaign-row" key={p.id}>
                <span className="status-pill review">{p.status === "pending" ? "確認待ち" : "一部承認"}</span>
                <div className="row-main">
                  <b>{p.month.replace("-", "年")}月 · {locName(p.locationId)} {a ? `${PLATFORM_LABELS[a.platform]} ${a.handle}` : ""}</b>
                  <small>{goalLabel(p.goal)} · {p.summary.slice(0, 70)}</small>
                </div>
                <Link className="button small soft" href={`/planner/proposals/${p.id}`}>確認する →</Link>
              </div>
            );
          })}
        </div>
      )}

      <div className="panel calendar-panel" style={{ position: "relative" }}>
        <div className="calendar-toolbar">
          <div className="month-control">
            <Link className="arrow-button" style={{ display: "grid", placeItems: "center", textDecoration: "none" }}
              href={q(`month=${shiftMonth({ year, month }, -1)}`)} aria-label="前の月">‹</Link>
            <b>{year}年{month}月</b>
            <Link className="arrow-button" style={{ display: "grid", placeItems: "center", textDecoration: "none" }}
              href={q(`month=${shiftMonth({ year, month }, 1)}`)} aria-label="次の月">›</Link>
            <Link className="button small" href={q("")}>今日</Link>
          </div>
        </div>
        <PlannerCalendar posts={posts} year={year} month={month} todayKey={jstDateKey(new Date())} highlightId={params.highlight} />
        {posts.length === 0 && (
          <div style={{ marginTop: 14 }}>
            <EmptyState icon="▦" title="まだ投稿がありません" description="「AIで1ヶ月分作成」でアカウント戦略に沿った企画案をつくり、確認して承認するとここに表示されます。"
              action={{ label: "アカウント戦略を確認", href: "/accounts" }} />
          </div>
        )}
      </div>
      <section className="lower-grid">
        <div className="panel section-spacer">
          <div className="panel-heading">
            <div>
              <div className="panel-title">今月の投稿目標</div>
              <div className="panel-subtitle">表示中のアカウントの投稿頻度から算出</div>
            </div>
            <span className="priority-tag">計画 {Math.min(100, Math.round((inMonth.length / target) * 100))}%</span>
          </div>
          <div className="metric-foot">予定 {inMonth.length} / 目標{target}本 · キャプション作成済み・予約 {approvedCount}本 · 日時未定 {unscheduled.length}本</div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(100, (inMonth.length / target) * 100)}%` }} /></div>
        </div>
        <div className="panel section-spacer">
          <div className="panel-title">表示中のアカウント</div>
          {scopedAccounts.length ? (
            scopedAccounts.slice(0, 6).map((a) => (
              <div className="campaign-row" key={a.id}>
                <span className={`platform-dot ${a.platform === "threads" ? "threads" : a.platform === "tiktok" ? "tiktok" : ""}`}>{PLATFORM_ICONS[a.platform]}</span>
                <div className="row-main"><b>{a.handle}</b><small>{locName(a.locationId)} · {goalLabel(a.goal, a.customGoal)} · 週{a.strategy.postsPerWeek}本</small></div>
                <span className="status-pill draft">API未連携</span>
              </div>
            ))
          ) : (
            <p className="activity-note" style={{ marginTop: 10 }}>運用中のアカウントがありません。<Link className="link-button" href="/accounts">アカウント戦略</Link>で登録できます。</p>
          )}
          <p className="not-connected">API連携（自動投稿・インサイト取得）は今後対応予定です。</p>
        </div>
      </section>
    </>
  );
}
