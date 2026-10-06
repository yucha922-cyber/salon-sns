import Link from "next/link";
import { requireAppContext } from "@/lib/auth/context";
import { getDataMode } from "@/lib/env";
import { PLATFORM_LABELS } from "@/lib/domain/labels";
import { formatInZone } from "@/lib/domain/timezone";
import { filterByLocation, getSocialContext } from "@/lib/social/access";
import { getCronSecret } from "@/lib/social/config";
import { runDemoTickIfDue } from "@/lib/social/demo-tick";
import { PUBLISH_FORMAT_LABELS } from "@/lib/social/validation";
import type { PublishJobStatus } from "@/lib/social/types";
import { PageHeading } from "@/components/ui/page-heading";
import { EmptyState } from "@/components/ui/states";
import { QueueActions, RunQueueButton } from "@/components/social/queue-actions";

const STATUS_LABELS: Record<PublishJobStatus, string> = {
  queued: "予約済み",
  publishing: "投稿中",
  retrying: "再試行待ち",
  published: "公開済み",
  failed: "失敗",
  cancelled: "取り消し",
};
const STATUS_PILL: Record<PublishJobStatus, string> = { queued: "queued", publishing: "queued", retrying: "queued", published: "", failed: "failed", cancelled: "draft" };

export default async function PublishingPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const app = await requireAppContext();
  const ctx = await getSocialContext(app);
  await runDemoTickIfDue(ctx.organizationId, app.repo);
  const q = await searchParams;
  const [jobsAll, accounts, locations, events] = await Promise.all([
    ctx.reader.listJobs(ctx.organizationId, { limit: 300 }),
    app.repo.listAccounts(ctx.organizationId),
    app.repo.listLocationProfiles(ctx.organizationId),
    ctx.reader.listEvents(ctx.organizationId, { limit: 40 }),
  ]);
  const jobs = filterByLocation(ctx, jobsAll);
  const tab = q.status === "done" ? "done" : q.status === "failed" ? "failed" : "active";
  const visible = jobs
    .filter((j) => (tab === "active" ? ["queued", "publishing", "retrying"].includes(j.status) : tab === "failed" ? j.status === "failed" : ["published", "cancelled"].includes(j.status)))
    .sort((a, b) => (tab === "active" ? a.scheduledAt.localeCompare(b.scheduledAt) : b.updatedAt.localeCompare(a.updatedAt)));
  const account = (id: string) => accounts.find((a) => a.id === id);
  const locName = (id: string | null) => (id ? (locations.find((l) => l.locationId === id)?.locationName ?? "店舗") : "本部");
  const counts = {
    active: jobs.filter((j) => ["queued", "publishing", "retrying"].includes(j.status)).length,
    failed: jobs.filter((j) => j.status === "failed").length,
    done: jobs.filter((j) => ["published", "cancelled"].includes(j.status)).length,
  };
  const scheduler = getDataMode() === "demo" ? "Demo Mode：ページを開いたとき（30秒ごと）にキューを処理します" : getCronSecret() ? "スケジューラー：/api/cron/social（CRON_SECRETで保護）" : "⚠ CRON_SECRETが未設定のため、予約投稿は自動実行されません（README参照）";
  const canRun = app.current.role === "owner" || app.current.role === "admin" || getDataMode() === "demo";

  return (
    <>
      <PageHeading eyebrow="SNS" title="Publish Queue"
        description="承認済みの投稿だけがここに入り、予約時刻になると自動で投稿されます。失敗した投稿は最大3回まで自動で再試行し、それでも失敗した場合は理由を表示します。"
        actions={canRun ? <RunQueueButton /> : undefined} />
      <div className="recommendation-callout" style={{ marginBottom: 14 }}>
        {scheduler} · タイムゾーン：{ctx.timezone}{!ctx.writer && getDataMode() !== "demo" ? " · ⚠ SUPABASE_SERVICE_ROLE_KEYが未設定のため投稿処理を実行できません" : ""}
      </div>
      <div className="tabs" role="tablist">
        {(["active", "failed", "done"] as const).map((t) => (
          <Link key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? "active" : ""}`} href={t === "active" ? "/publishing" : `/publishing?status=${t}`}>
            {t === "active" ? "予約・処理中" : t === "failed" ? "失敗" : "完了・取り消し"} <span>{counts[t]}</span>
          </Link>
        ))}
      </div>
      <div className="panel">
        {visible.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>予約日時</th><th>投稿</th><th>投稿先</th><th>形式</th><th>状態</th><th>試行</th><th>結果・エラー</th><th /></tr></thead>
              <tbody>
                {visible.map((j) => {
                  const a = account(j.socialAccountId);
                  return (
                    <tr key={j.id}>
                      <td>{formatInZone(j.status === "retrying" ? j.nextAttemptAt : j.scheduledAt, ctx.timezone)}{j.mode === "immediate" && <small className="table-muted"> 今すぐ</small>}</td>
                      <td className="table-strong" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{j.content.title}</td>
                      <td>{locName(j.locationId)} / {PLATFORM_LABELS[j.provider]} {a?.handle}</td>
                      <td className="table-muted">{PUBLISH_FORMAT_LABELS[j.format] ?? j.format}</td>
                      <td><span className={`status-pill ${STATUS_PILL[j.status]}`}>{STATUS_LABELS[j.status]}</span></td>
                      <td className="table-muted">{j.attemptCount}/{j.maxAttempts}</td>
                      <td style={{ maxWidth: 260, whiteSpace: "normal" }} className="table-muted">
                        {j.status === "published" && j.providerPermalink ? <a className="link-button" href={j.providerPermalink} target="_blank" rel="noreferrer">投稿を開く ↗</a> : j.lastError ?? "—"}
                      </td>
                      <td><QueueActions jobId={j.id} status={j.status} readOnly={app.current.role === "viewer"} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="◷" title={tab === "active" ? "予約中の投稿はありません" : "該当する投稿はありません"}
            description="投稿カレンダーで投稿を開き、「投稿内容を承認」→「予約投稿に登録」で追加できます。" action={{ label: "投稿カレンダーへ", href: "/planner" }} />
        )}
      </div>
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-heading"><div><div className="panel-title">イベントログ</div><div className="panel-subtitle">接続・トークン更新・投稿・Insights・AI分析の記録（監査用）</div></div></div>
        {events.length ? (
          <ul className="event-log" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {filterByLocation(ctx, events).map((e) => (
              <li key={e.id}><time>{formatInZone(e.createdAt, ctx.timezone, false)}</time><span className={e.level}>{e.message}</span></li>
            ))}
          </ul>
        ) : (
          <p className="activity-note">まだ記録はありません。</p>
        )}
      </div>
    </>
  );
}
