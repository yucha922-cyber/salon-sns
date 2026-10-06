export const metadata = { title: "データ削除リクエスト" };

/** Public status page Meta links to after a data deletion request. */
export default async function DataDeletionPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <h1>データ削除リクエスト</h1>
        <p className="auth-sub">
          Instagram / Threads 連携で保存していたアクセストークンと連携プロフィール情報は削除済みです。
          {code ? <>確認コード：<b>{code.replace(/[^A-Za-z0-9_-]/g, "")}</b></> : null}
        </p>
        <p className="auth-sub">投稿履歴など組織が作成したデータの削除をご希望の場合は、ワークスペース管理者までご連絡ください。</p>
      </div>
    </main>
  );
}
