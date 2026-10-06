"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { BrandBrainInput } from "@/lib/domain/types";
import { saveBrandBrainAction } from "@/app/actions/brand";
import { createDemoOrganizationAction, createOrganizationAction } from "@/app/actions/organization";
import {
  AudienceSection,
  cleanBrandBrain,
  CompanySection,
  GoalsSection,
  LocationsSection,
  ServicesSection,
  ToneSection,
} from "@/components/brand/sections";
import { Spinner } from "@/components/ui/states";

const STEPS = [
  { title: "会社情報", lead: "まずはお店の基本情報を教えてください。AIがあなたのビジネスを理解する土台になります。" },
  { title: "店舗", lead: "店舗の場所を登録します。地域に合わせたハッシュタグや投稿に使われます。" },
  { title: "サービス", lead: "代表的なメニューと、選ばれる理由を教えてください。" },
  { title: "ターゲット", lead: "どんなお客様に来てほしいですか？悩みが具体的なほど、AIの提案が的確になります。" },
  { title: "ブランドトーン", lead: "SNSでどんな雰囲気・言葉づかいで発信したいかを決めます。" },
  { title: "SNS・広告の目的", lead: "最後に、達成したい目標を教えてください。" },
] as const;

export function OnboardingWizard({
  initial,
  initialStep,
  hasOrganization,
  canCreateDemo,
}: {
  initial: BrandBrainInput;
  initialStep: number;
  hasOrganization: boolean;
  canCreateDemo: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(initialStep, STEPS.length - 1));
  const [value, setValue] = useState<BrandBrainInput>(initial);
  const [orgCreated, setOrgCreated] = useState(hasOrganization);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const onChange = (patch: Partial<BrandBrainInput>) => setValue((v) => ({ ...v, ...patch }));

  const validateStep = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (!value.companyName.trim() && !value.brandName.trim()) e.companyName = "会社名またはブランド名を入力してください";
      if (!value.industry.label.trim()) e["industry.label"] = "業種を入力してください";
    }
    if (step === 1 && !value.locations.some((l) => l.name.trim())) e.locations = "店舗を1つ以上登録してください";
    if (step === 2 && !value.services.some((s) => s.name.trim())) e.services = "サービスを1つ以上登録してください";
    return e;
  };

  const next = () => {
    const stepErrors = validateStep();
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length) {
      setError(Object.values(stepErrors)[0] ?? null);
      return;
    }
    setError(null);
    startTransition(async () => {
      if (!orgCreated) {
        const created = await createOrganizationAction({ name: value.brandName.trim() || value.companyName.trim() });
        if (!created.ok) {
          setError(created.error);
          return;
        }
        setOrgCreated(true);
      }
      const isLast = step === STEPS.length - 1;
      const cleaned = cleanBrandBrain(value);
      const saved = await saveBrandBrainAction(
        { ...cleaned, companyName: cleaned.companyName || cleaned.brandName, brandName: cleaned.brandName || cleaned.companyName },
        { onboardingStep: step + 1, completeOnboarding: isLast },
      );
      if (!saved.ok) {
        setError(saved.error);
        setErrors(saved.fieldErrors ?? {});
        return;
      }
      if (isLast) {
        router.push("/onboarding/complete");
        return;
      }
      setStep(step + 1);
      window.scrollTo(0, 0);
    });
  };

  const useDemo = () =>
    startTransition(async () => {
      const result = await createDemoOrganizationAction();
      if (!result.ok) return setError(result.error);
      router.push("/dashboard");
      router.refresh();
    });

  const current = STEPS[step] ?? STEPS[0];
  return (
    <div className="onboarding-card">
      <div className="onboarding-progress">
        <div className="progress-steps" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s.title} className={i < step ? "done" : i === step ? "current" : ""} />
          ))}
        </div>
        <div className="progress-meta">
          <span>
            Step {step + 1} / {STEPS.length} · {current.title}
          </span>
          <span>約{Math.max(1, STEPS.length - step)}分</span>
        </div>
      </div>
      <div className="onboarding-body">
        <h1>{current.title}</h1>
        <p className="lead">{current.lead}</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        {step === 0 && !orgCreated && canCreateDemo && (
          <div className="choice-cards" style={{ marginBottom: 18 }}>
            <div className="choice-card" style={{ cursor: "default", borderColor: "#d3e6de", background: "#f5faf7" }}>
              <b>自分のお店で始める</b>
              <span>このまま質問に答えて、あなた専用のBrand Brainを作成します。</span>
            </div>
            <button type="button" className="choice-card" onClick={useDemo} disabled={pending}>
              <b>✳ デモ組織で試す</b>
              <span>架空の整体院「NAORU整体 渋谷院」のデータで、すぐに全機能を体験できます。</span>
            </button>
          </div>
        )}
        {step === 0 && <CompanySection value={value} onChange={onChange} errors={errors} />}
        {step === 1 && <LocationsSection value={value} onChange={onChange} errors={errors} />}
        {step === 2 && <ServicesSection value={value} onChange={onChange} errors={errors} compact />}
        {step === 3 && <AudienceSection value={value} onChange={onChange} errors={errors} compact />}
        {step === 4 && <ToneSection value={value} onChange={onChange} errors={errors} />}
        {step === 5 && <GoalsSection value={value} onChange={onChange} errors={errors} compact />}
      </div>
      <div className="onboarding-actions">
        <button className="button" onClick={() => setStep(step - 1)} disabled={step === 0 || pending}>
          ← 戻る
        </button>
        <button className="button primary" onClick={next} disabled={pending}>
          {pending && <Spinner />}
          {step === STEPS.length - 1 ? "Brand Brainを完成させる" : "次へ →"}
        </button>
      </div>
    </div>
  );
}
