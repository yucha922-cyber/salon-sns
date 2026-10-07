import { cookies } from "next/headers";
import { requireAppContext } from "@/lib/auth/context";
import { getAdsContext } from "@/lib/ads/access";
import { ensureDemoAds } from "@/lib/ads/app";
import { ADS_PENDING_COOKIE, getPendingAdAccounts } from "@/lib/ads/connect";
import { adsProviderKind, META_ADS_API, META_ADS_SCOPES } from "@/lib/ads/meta/config";
import { PageHeading } from "@/components/ui/page-heading";
import { AdsTabs } from "@/components/ads/ui";
import { SyncAdsButton } from "@/components/ads/ads-buttons";
import { AccountSelection, CampaignSettingsRow, DisconnectButton } from "@/components/ads/connect-forms";

export const metadata = { title: "広告アカウント接続" };

const STATUS: Record<string, [string, string]> = {
  connected: ["接続中", ""],
  expired: ["期限切れ", "failed"],
  error: ["エラー", "failed"],
  disconnected: ["未接続", "draft"],
  reauthorization_required: ["再接続が必要", "failed"],
};

export default async function AdsConnectPage({ searchParams }: { searchParams: Promise<{ select?: string; error?: string }> }) {
  const app = await requireAppContext();
  const q = await searchParams;
  const ctx = await getAdsContext(app);
  await ensureDemoAds(app, ctx);
  const [accounts, campaigns] = await Promise.all([ctx.reader.listAdAccounts(ctx.organizationId), ctx.reader.listCampaigns(ctx.organizationId)]);
  const pending = q.select ? await getPendingAdAccounts(app, (await cookies()).get(ADS_PENDING_COOKIE)?.value) : null;
  const locations = app.brain.locations.filter((l) => l.id).map((l) => ({ id: l.id as string, label: l.name }));
  const canOperate = ctx.role === "owner" || ctx.role === "admin" || (ctx.role === "editor" && ctx.locationIds !== null);
  const mock = adsProviderKind(ctx.isDemo) === "mock";
  return (
    <>
      <PageHeading
        eyebrow="Meta広告 × AI"
        title="広告アカウント接続・キャンペーン設定"
        description="Organization単位でMeta広告アカウントを接続します。アクセストークンはサーバーで暗号化して保存し、ブラウザには渡しません。"
        actions={
          canOperate ? (
            <a className="button primary" href="/api/ads/connect" data-testid="connect-ad-account">
              ＋ Meta広告アカウントを接続
            </a>
          ) : undefined
        }
      />
      <AdsTabs current="/ads/connect" />
      {q.error && (
        <div className="issue error" style={{ marginBottom: 12 }}>
          <b>接続できませんでした</b>
          <small>{q.error.slice(0, 300)}</small>
        </div>
      )}
      {pending && <AccountSelection accounts={pending.map((a) => ({ externalAccountId: a.externalAccountId, name: a.name, currency: a.currency, timezone: a.timezone, businessName: a.businessName }))} locations={locations} />}
      {q.select && !pending && <div className="issue warning">接続の有効期限が切れました。もう一度「Meta広告アカウントを接続」からやり直してください。</div>}

      <div className="panel section-spacer">
        <div className="panel-title" style={{ marginBottom: 8 }}>接続済みの広告アカウント</div>
        {accounts.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>アカウント</th>
                  <th>状態</th>
                  <th>通貨 / タイムゾーン</th>
                  <th>権限</th>
                  <th>トークン期限</th>
                  <th>最終同期</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const [label, cls] = STATUS[a.connectionStatus] ?? [a.connectionStatus, "draft"];
                  return (
                    <tr key={a.id}>
                      <td className="table-strong">
                        {a.name}
                        <div className="table-muted" style={{ fontSize: 9 }}>
                          {a.externalAccountId}
                          {a.metadata.mock ? " · デモ（MockAdsProvider）" : ""}
                        </div>
                      </td>
                      <td>
                        <span className={`status-pill ${cls}`}>{label}</span>
                        {a.connectionError && <div className="field-error">{a.connectionError}</div>}
                      </td>
                      <td>
                        {a.currency} / {a.timezone}
                      </td>
                      <td className="table-muted" style={{ whiteSpace: "normal", maxWidth: 200 }}>{a.scopes.join(", ")}</td>
                      <td>{a.tokenExpiresAt ? new Date(a.tokenExpiresAt).toLocaleDateString("ja-JP") : "—"}</td>
                      <td>{a.lastSyncedAt ? new Date(a.lastSyncedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "未同期"}</td>
                      <td style={{ display: "flex", gap: 6 }}>
                        {a.connectionStatus !== "disconnected" && <SyncAdsButton adAccountId={a.id} disabled={ctx.role === "viewer"} />}
                        {canOperate && a.connectionStatus !== "disconnected" && <DisconnectButton adAccountId={a.id} name={a.name} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="insufficient">まだ接続されていません。</div>
        )}
      </div>

      {campaigns.length > 0 && (
        <div className="panel section-spacer">
          <div className="panel-title">キャンペーン設定（人が決める項目）</div>
          <p className="field-hint" style={{ marginTop: 6 }}>目的（集客/採用）で評価軸が変わります。LP URLはLP起因の問題検知に、CVイベントはInsightsのどのアクションをCVとして数えるかに使います（Schedule / Lead / SubmitApplication / custom:&lt;カスタムコンバージョンID&gt;）。</p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>キャンペーン</th>
                  <th>目的</th>
                  <th>店舗</th>
                  <th>LP URL</th>
                  <th>CVイベント</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <CampaignSettingsRow key={c.id} campaign={c} locations={locations} readOnly={ctx.role === "viewer"} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel section-spacer">
        <div className="panel-title" style={{ marginBottom: 6 }}>接続の仕組み</div>
        <ul className="field-hint" style={{ lineHeight: 1.9, paddingLeft: 16 }}>
          <li>Marketing API {META_ADS_API.version} / Facebook Login for Business。要求する権限: {META_ADS_SCOPES.join(", ")}</li>
          <li>AIができること: データ取得・分析・仮説・Creative案の作成。AIだけでは配信・停止・予算・ターゲティングを変更しません。</li>
          <li>Metaへの反映（テスト広告の作成・開始・停止）は、管理者または店舗マネージャーの最終確認後のみ実行し、監査ログに記録します。</li>
          {mock && <li>この環境はデモ（MockAdsProvider）です。実際のMetaには接続しません。</li>}
        </ul>
      </div>
    </>
  );
}
