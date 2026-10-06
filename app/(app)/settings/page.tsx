import Link from "next/link";
import { requireAppContext } from "@/lib/auth/context";
import { getDataMode } from "@/lib/env";
import { getAIProvider } from "@/lib/ai";
import { PageHeading } from "@/components/ui/page-heading";
import { WorkspaceForm } from "@/components/settings/workspace-form";

const ROLE_LABELS = { owner: "オーナー", admin: "管理者", editor: "編集者", viewer: "閲覧者" } as const;

export default async function SettingsPage() {
  const { user, current, memberships } = await requireAppContext();
  const mode = getDataMode();
  const provider = getAIProvider().name;
  return (
    <>
      <PageHeading eyebrow="環境設定" title="設定" description="ワークスペースとアカウントの設定。" />
      <div className="settings-grid">
        <aside className="settings-menu">
          {["ワークスペース", "メンバー", "SNSアカウント", "広告アカウント", "通知", "プラン・請求"].map((x, i) => (
            <div key={x} className={`brand-tab ${i === 0 ? "active" : ""}`}>{["◫", "♧", "◎", "⌁", "♢", "◇"][i]}　{x}{i > 0 && <span className="optional">準備中</span>}</div>
          ))}
        </aside>
        <div className="settings-form">
          <h2>ワークスペース設定</h2>
          <p>組織情報と業種は <Link className="link-button" href="/brand">Brand Brain</Link> で管理します。</p>
          <WorkspaceForm name={current.organization.name} canEdit={current.role === "owner" || current.role === "admin"} />
          <div className="field" style={{ marginTop: 18 }}>
            <label>アカウント</label>
            <div className="recommendation-callout">
              {user.displayName}（{user.email}）· 権限：{ROLE_LABELS[current.role]} · 所属組織 {memberships.length}件
              {current.organization.isDemo && <><br />この組織はデモ組織です。実データと分離されています。</>}
            </div>
          </div>
          <div className="field">
            <label>承認ワークフロー</label>
            <div className="recommendation-callout">広告予算やキャンペーン設定の変更には、オーナーの承認が必要です。MVPでは広告の自動変更は行いません。</div>
          </div>
          <div className="field">
            <label>システム</label>
            <div className="recommendation-callout">
              データ：{mode === "supabase" ? "Supabase（PostgreSQL + RLS）" : "Demoモード（サーバー内メモリ）"} · AI：{provider === "mock" ? "モック（APIキー未設定）" : provider}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
