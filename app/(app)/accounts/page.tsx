import Link from "next/link";
import { requireAppContext } from "@/lib/auth/context";
import { getDataMode } from "@/lib/env";
import { isProviderConfigured } from "@/lib/social/registry";
import { socialProviderKind } from "@/lib/social/config";
import { PageHeading } from "@/components/ui/page-heading";
import { AccountsBoard } from "@/components/accounts/accounts-board";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ social_error?: string; connected?: string }> }) {
  const { repo, current, brain } = await requireAppContext();
  const q = await searchParams;
  const orgId = current.organization.id;
  const [accounts, posts, pillars] = await Promise.all([repo.listAccounts(orgId), repo.listPosts(orgId), repo.listContentPillars(orgId)]);
  const postCounts: Record<string, number> = {};
  for (const p of posts) if (p.accountId) postCounts[p.accountId] = (postCounts[p.accountId] ?? 0) + 1;
  const isDemo = current.organization.isDemo;
  const mock = socialProviderKind(isDemo) === "mock";
  // Connecting accounts: owner / admin, or a location-scoped manager.
  const canManage = current.role === "owner" || current.role === "admin" || (current.role === "editor" && current.locationIds !== null);
  const configured = { instagram: isProviderConfigured("instagram", isDemo), threads: isProviderConfigured("threads", isDemo) };
  return (
    <>
      <PageHeading eyebrow="本部・店舗" title="アカウント戦略"
        description="本部と各店舗のSNSアカウントごとに「何のために運用するか」と運用戦略を設定し、Instagram / Threads を接続します。AIの月間計画・投稿作成・予約投稿はこの設定に沿って動きます。"
        actions={
          canManage ? (
            <>
              {/* Full-page navigation to the OAuth start route (sets the state cookie and redirects to Meta). */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a className="button" href="/api/social/connect/threads" aria-disabled={!configured.threads}>@ Threadsを接続</a>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a className="button primary" href="/api/social/connect/instagram" aria-disabled={!configured.instagram}>◎ Instagramを接続</a>
            </>
          ) : undefined
        } />
      {q.social_error && <div className="form-error" role="alert">{q.social_error}</div>}
      {q.connected && <div className="form-success" role="status">{q.connected} を接続しました。投稿の承認後、予約投稿・Insights取得が利用できます。</div>}
      <div className="recommendation-callout" style={{ marginBottom: 14 }}>
        {mock ? (
          <><b>Demo Mode：</b>Instagram / Threads への接続はモック（MockSocialProvider）で動作し、実際のSNSには投稿されません。{getDataMode() === "demo" ? "" : "（デモ組織）"}</>
        ) : (
          <><b>SNS連携：</b>Instagramはプロアカウント（ビジネス/クリエイター）が必要です。Facebookページは不要です（Instagramログイン方式）。
            {!configured.instagram || !configured.threads ? <> 現在 {[!configured.instagram && "Instagram", !configured.threads && "Threads"].filter(Boolean).join(" / ")} のMeta App設定が未完了です（管理者向け：READMEの「Meta App Setup」）。</> : null}
          </>
        )}{" "}
        アクセストークンはサーバー側で暗号化して保存され、画面には表示されません。<Link className="link-button" href="/publishing">Publish Queue →</Link>
      </div>
      <AccountsBoard
        accounts={accounts}
        locations={brain.locations.flatMap((l) => (l.id ? [{ id: l.id, name: l.name }] : []))}
        pillars={pillars}
        postCounts={postCounts}
        readOnly={current.role === "viewer"}
        canManageConnections={canManage}
      />
    </>
  );
}
