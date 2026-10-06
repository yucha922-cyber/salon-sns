import Link from "next/link";
import { requireAppContext } from "@/lib/auth/context";
import { getPendingCandidates } from "@/lib/social/connections";
import { canAccessLocation } from "@/lib/social/access";
import { PageHeading } from "@/components/ui/page-heading";
import { EmptyState } from "@/components/ui/states";
import { ConnectAccountForm } from "@/components/social/connect-account-form";

/** OAuth result → the user decides which account / location this connection belongs to. */
export default async function ConnectAccountPage({ searchParams }: { searchParams: Promise<{ pending?: string; account?: string }> }) {
  const app = await requireAppContext();
  const q = await searchParams;
  const pending = q.pending && /^[A-Za-z0-9-]{1,64}$/.test(q.pending) ? await getPendingCandidates(app, q.pending) : null;
  if (!pending) {
    return (
      <>
        <PageHeading eyebrow="SNS連携" title="接続するアカウントを選択" description="認可したSNSアカウントを、どの店舗・目的のアカウントとして使うかを選びます。" />
        <div className="panel">
          <EmptyState icon="◎" title="接続情報の有効期限が切れました" description="セキュリティのため、認可後15分以内に保存してください。もう一度「接続」からやり直してください。" action={{ label: "アカウント戦略へ戻る", href: "/accounts" }} />
        </div>
      </>
    );
  }
  const orgId = app.current.organization.id;
  const scope = { locationIds: app.current.locationIds };
  const accounts = (await app.repo.listAccounts(orgId)).filter((a) => a.platform === pending.platform && canAccessLocation(scope, a.locationId));
  const locations = app.brain.locations.flatMap((l) => (l.id && canAccessLocation(scope, l.id) ? [{ id: l.id, name: l.name }] : []));
  const label = pending.platform === "instagram" ? "Instagram" : "Threads";
  return (
    <>
      <PageHeading eyebrow="SNS連携" title={`${label}アカウントの紐付け`}
        description="誤投稿を防ぐため、接続したSNSアカウントを「どの店舗の、どの目的のアカウント」として使うかを確認してから保存します。" />
      <div className="panel" style={{ maxWidth: 720 }}>
        <ConnectAccountForm
          pendingId={q.pending as string}
          platform={pending.platform}
          candidates={pending.candidates}
          accounts={accounts.map((a) => ({ id: a.id, label: `${a.locationId ? (locations.find((l) => l.id === a.locationId)?.name ?? "店舗") : "本部"} / ${a.handle}${a.displayName ? `（${a.displayName}）` : ""}`, connected: a.connection.status === "connected" }))}
          locations={locations}
          allowHq={app.current.locationIds === null}
          preselectAccountId={q.account ?? null}
        />
        <p className="field-hint" style={{ marginTop: 12 }}><Link className="link-button" href="/accounts">キャンセルして戻る</Link>（このまま閉じると接続情報は15分後に自動削除されます）</p>
      </div>
    </>
  );
}
