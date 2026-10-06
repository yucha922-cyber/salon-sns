"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { signInAction, signInAsDemoAction, signUpAction } from "@/app/actions/auth";
import { Field } from "@/components/ui/form";
import { Spinner } from "@/components/ui/states";

function safeNext(value: string | null): string {
  // Only allow same-site relative paths (prevents open redirects).
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export function LoginForm({ demoMode }: { demoMode: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const finish = () => {
    router.push(safeNext(params.get("next")));
    router.refresh();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await signInAction({ email, password });
      if (result.ok) return finish();
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
    });
  };

  const demoLogin = () =>
    startTransition(async () => {
      const result = await signInAsDemoAction();
      if (result.ok) return finish();
      setError(result.error);
    });

  return (
    <form onSubmit={onSubmit} noValidate>
      {params.get("confirmed") && <div className="form-success">メールアドレスを確認しました。ログインしてください。</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <Field label="メールアドレス" htmlFor="email" error={fieldErrors.email}>
        <input id="email" className={`input ${fieldErrors.email ? "invalid" : ""}`} type="email" autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
      </Field>
      <Field label="パスワード" htmlFor="password" error={fieldErrors.password}>
        <input id="password" className={`input ${fieldErrors.password ? "invalid" : ""}`} type="password" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <button className="button primary" type="submit" disabled={pending}>
        {pending ? <Spinner /> : null} ログイン
      </button>
      {demoMode && (
        <>
          <div className="auth-divider">または</div>
          <button type="button" className="button" style={{ width: "100%", justifyContent: "center", height: 38 }} onClick={demoLogin} disabled={pending}>
            ✳ デモアカウントで試す（NAORU整体 渋谷院）
          </button>
        </>
      )}
      <div className="auth-footer">
        アカウントをお持ちでない方は <Link className="link-button" href="/signup">新規登録</Link>
      </div>
    </form>
  );
}

export function SignupForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmSent, setConfirmSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await signUpAction({ displayName, email, password });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      if (result.data.needsEmailConfirmation) {
        setConfirmSent(true);
        return;
      }
      router.push("/onboarding");
      router.refresh();
    });
  };

  if (confirmSent) {
    return (
      <div className="form-success">
        確認メールを {email} に送信しました。メール内のリンクを開くと登録が完了します。
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {error && <div className="form-error" role="alert">{error}</div>}
      <Field label="お名前" htmlFor="displayName" error={fieldErrors.displayName}>
        <input id="displayName" className={`input ${fieldErrors.displayName ? "invalid" : ""}`} autoComplete="name"
          value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="山本 花子" />
      </Field>
      <Field label="メールアドレス" htmlFor="email" error={fieldErrors.email}>
        <input id="email" className={`input ${fieldErrors.email ? "invalid" : ""}`} type="email" autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </Field>
      <Field label="パスワード" htmlFor="password" hint="8文字以上" error={fieldErrors.password}>
        <input id="password" className={`input ${fieldErrors.password ? "invalid" : ""}`} type="password" autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <button className="button primary" type="submit" disabled={pending}>
        {pending ? <Spinner /> : null} アカウントを作成
      </button>
      <div className="auth-footer">
        すでにアカウントをお持ちの方は <Link className="link-button" href="/login">ログイン</Link>
      </div>
    </form>
  );
}
