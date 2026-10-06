import Link from "next/link";
import { requireAppContext } from "@/lib/auth/context";
import { brandBrainCompleteness } from "@/lib/brand/context";
import { BrandLogo } from "@/components/auth/brand-logo";

export const metadata = { title: "Brand Brain 完成 | NAORU" };

export default async function OnboardingCompletePage() {
  const { brain } = await requireAppContext();
  const { score, missing } = brandBrainCompleteness(brain);
  return (
    <div className="onboarding-shell">
      <div className="onboarding-top"><BrandLogo /></div>
      <div className="onboarding-card">
        <div className="onboarding-progress">
          <div className="progress-steps" aria-hidden>{Array.from({ length: 6 }, (_, i) => <span key={i} className="done" />)}</div>
          <div className="progress-meta"><span>Step 6 / 6 · 完了</span><span>お疲れさまでした</span></div>
        </div>
        <div className="onboarding-body" style={{ paddingBottom: 22 }}>
          <div className="eyebrow">Brand Brain 完成</div>
          <h1>AIマーケターがあなたのお店を理解しました</h1>
          <p className="lead">
            登録した情報は、AIマーケター・投稿作成・Creative Studio・広告分析のすべてで共通して使われます。あとからBrand Brainでいつでも編集できます。
          </p>
          <div className="recommendation-callout">
            <b>{brain.brandName || brain.companyName}</b> · {brain.industry.label}
            <br />
            ターゲット：{[brain.targetAudience.ageRange, brain.targetAudience.occupation].filter(Boolean).join(" / ") || "未設定"}
            <br />
            悩み：{brain.targetAudience.painPoints.join("、") || "未設定"}
            <br />
            強み：{brain.strengths.join("、") || "未設定"}
          </div>
          <div className="brand-progress" style={{ marginTop: 16 }}><i style={{ width: `${score}%` }} /></div>
          <div className="field-hint" style={{ marginTop: 8 }}>
            完成度 {score}%{missing.length ? ` · 追加すると精度が上がる項目：${missing.join("、")}` : ""}
          </div>
        </div>
        <div className="onboarding-actions">
          <Link className="button" href="/brand">Brand Brainを確認</Link>
          <Link className="button primary" href="/dashboard">ダッシュボードへ →</Link>
        </div>
      </div>
    </div>
  );
}
