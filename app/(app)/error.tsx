"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="error-panel" role="alert">
      <b>ページを表示できませんでした</b>
      <p style={{ fontSize: 10, margin: "8px 0 14px" }}>通信状況を確認して、もう一度お試しください。</p>
      <button className="button small" onClick={reset}>再読み込み</button>
    </div>
  );
}
