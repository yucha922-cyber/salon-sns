import { notFound } from "next/navigation";
import { requireAppContext } from "@/lib/auth/context";
import { socialProviderKind } from "@/lib/social/config";

export const metadata = { title: "SNS連携（デモ）" };

/** Demo Mode stand-in for the Instagram / Threads authorization screen. */
export default async function MockAuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const app = await requireAppContext();
  if (socialProviderKind(app.current.organization.isDemo) !== "mock") notFound();
  const q = await searchParams;
  const platform = q.platform === "threads" ? "threads" : "instagram";
  const label = platform === "instagram" ? "Instagram" : "Threads";
  const scopes =
    platform === "instagram"
      ? ["instagram_business_basic（プロフィール）", "instagram_business_content_publish（投稿）", "instagram_business_manage_insights（インサイト）"]
      : ["threads_basic（プロフィール）", "threads_content_publish（投稿）", "threads_manage_insights（インサイト）"];
  return (
    <main className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 460 }}>
        <span className="demo-mode-pill">Demo Mode</span>
        <h1 style={{ marginTop: 12 }}>{label} の連携（デモ）</h1>
        <p className="field-hint">
          本番ではMetaの認可画面が表示されます。デモでは実際の{label}には接続せず、モックのアカウントを作成します（投稿は実際には公開されません）。
        </p>
        <div className="recommendation-callout" style={{ margin: "12px 0" }}>
          <b>NAORU AI が次の権限をリクエストしています</b>
          <ul style={{ margin: "6px 0 0 18px" }}>{scopes.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
        <form action="/api/social/mock-authorize" method="get">
          <input type="hidden" name="platform" value={platform} />
          <input type="hidden" name="state" value={q.state ?? ""} />
          <input type="hidden" name="redirect_uri" value={q.redirect_uri ?? ""} />
          <div className="field">
            <label htmlFor="username">接続する{label}アカウント（ユーザーネーム）</label>
            <input id="username" name="username" className="input" defaultValue={platform === "instagram" ? "naoru_shinjuku" : "naoru_shinjuku_threads"} pattern="[A-Za-z0-9._]{1,30}" required />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="button" name="decision" value="deny" type="submit" formNoValidate>キャンセル</button>
            <button className="button primary" name="decision" value="allow" type="submit">許可する</button>
          </div>
        </form>
      </div>
    </main>
  );
}
