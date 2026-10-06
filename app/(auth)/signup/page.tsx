import { BrandLogo } from "@/components/auth/brand-logo";
import { SignupForm } from "@/components/auth/auth-forms";

export const metadata = { title: "新規登録 | NAORU" };

export default function SignupPage() {
  return (
    <section className="auth-card">
      <BrandLogo />
      <h1>アカウントを作成</h1>
      <p className="auth-sub">登録後、5分ほどの質問に答えるだけで、あなたのお店専属のAIマーケターが使えるようになります。</p>
      <SignupForm />
    </section>
  );
}
