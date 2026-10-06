import Link from "next/link";

export default function NotFound() {
  return (
    <div className="auth-shell">
      <section className="auth-card" style={{ textAlign: "center" }}>
        <div className="empty-icon" style={{ fontSize: 22, color: "#94b5a8" }}>◎</div>
        <h1 style={{ marginTop: 8 }}>ページが見つかりません</h1>
        <p className="auth-sub">
          URLが間違っているか、デモデータがリセットされた可能性があります（Demo Modeのデータはサーバー再起動で初期状態に戻ります）。
        </p>
        <Link className="button primary" href="/dashboard" style={{ justifyContent: "center", width: "100%", height: 38 }}>
          ダッシュボードへ戻る
        </Link>
      </section>
    </div>
  );
}
