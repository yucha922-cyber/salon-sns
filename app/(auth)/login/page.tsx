import { Suspense } from "react";
import { BrandLogo } from "@/components/auth/brand-logo";
import { LoginForm } from "@/components/auth/auth-forms";
import { getDataMode } from "@/lib/env";

export const metadata = { title: "ログイン | NAORU" };

export default function LoginPage() {
  const demoMode = getDataMode() === "demo";
  return (
    <section className="auth-card">
      <BrandLogo />
      <h1>おかえりなさい</h1>
      <p className="auth-sub">ログインして、AIマーケターと一緒に集客を進めましょう。</p>
      <Suspense>
        <LoginForm demoMode={demoMode} />
      </Suspense>
      {demoMode && (
        <p className="mode-note">
          Demo Mode で起動中です。Supabase・AI APIに接続せず、モックデータで全画面を確認できます（データはサーバー再起動で初期状態に戻ります）。
        </p>
      )}
    </section>
  );
}
