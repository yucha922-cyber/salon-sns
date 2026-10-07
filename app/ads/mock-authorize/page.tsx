import { notFound } from "next/navigation";
import { requireAppContext } from "@/lib/auth/context";
import { adsProviderKind } from "@/lib/ads/meta/config";

export const metadata = { title: "Meta広告連携（デモ）" };

/** Demo Mode stand-in for Facebook Login for Business (ad account access). */
export default async function MockAdsAuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const app = await requireAppContext();
  if (adsProviderKind(app.current.organization.isDemo) !== "mock") notFound();
  const q = await searchParams;
  return (
    <main className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 480 }}>
        <span className="demo-mode-pill">Demo Mode</span>
        <h1 style={{ marginTop: 12 }}>Meta広告アカウントの連携（デモ）</h1>
        <p className="field-hint">本番ではFacebookログイン（ビジネス向け）の画面が表示されます。デモでは実際のMetaには接続せず、モックの広告アカウントを使います。広告が実際に配信されることはありません。</p>
        <div className="recommendation-callout" style={{ margin: "12px 0" }}>
          <b>NAORU AI が次の権限をリクエストしています</b>
          <ul style={{ margin: "6px 0 0 18px" }}>
            <li>ads_read（広告データ・Insightsの読み取り）</li>
            <li>ads_management（承認済みテスト広告の作成・停止）</li>
            <li>business_management（ビジネスの広告アカウント一覧）</li>
          </ul>
        </div>
        <form action="/api/ads/mock-authorize" method="get">
          <input type="hidden" name="state" value={q.state ?? ""} />
          <input type="hidden" name="redirect_uri" value={q.redirect_uri ?? ""} />
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="button" name="decision" value="deny" type="submit">キャンセル</button>
            <button className="button primary" name="decision" value="allow" type="submit">許可する</button>
          </div>
        </form>
      </div>
    </main>
  );
}
