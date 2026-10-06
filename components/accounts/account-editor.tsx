"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AccountGoal, SnsAccount, SnsAccountInput, SocialPlatform } from "@/lib/domain/types";
import { ACCOUNT_GOALS, SOCIAL_PLATFORMS } from "@/lib/domain/types";
import { ACCOUNT_GOAL_LABELS, PLATFORM_LABELS } from "@/lib/domain/labels";
import { GOAL_PRESETS } from "@/lib/brand/account-goals";
import { deleteAccountAction, saveAccountAction, suggestAccountStrategyAction } from "@/app/actions/strategy";
import { Modal } from "@/components/ui/modal";
import { ChoiceChips, Field, TagInput } from "@/components/ui/form";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

export function newAccountInput(goal: AccountGoal = "acquisition"): SnsAccountInput {
  const preset = GOAL_PRESETS[goal].strategy;
  return {
    platform: "instagram",
    handle: "",
    displayName: "",
    locationId: null,
    goal,
    strategy: { ...preset, kpis: [...preset.kpis], contentPillars: [...preset.contentPillars] },
  };
}

export function AccountEditor({
  account,
  initial,
  locations,
  onClose,
}: {
  account: SnsAccount | null;
  initial: SnsAccountInput;
  locations: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState<SnsAccountInput>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [suggesting, startSuggest] = useTransition();
  const s = value.strategy;
  const setStrategy = (patch: Partial<SnsAccountInput["strategy"]>) => setValue((v) => ({ ...v, strategy: { ...v.strategy, ...patch } }));

  const applyPreset = (goal: AccountGoal) => {
    const preset = GOAL_PRESETS[goal].strategy;
    setValue((v) => ({ ...v, goal, strategy: { ...preset, persona: v.strategy.persona, kpis: [...preset.kpis], contentPillars: [...preset.contentPillars] } }));
  };

  const suggest = () =>
    startSuggest(async () => {
      const result = await suggestAccountStrategyAction({ platform: value.platform, goal: value.goal, handle: value.handle, locationId: value.locationId });
      if (!result.ok) return toast(result.error, "error");
      setValue((v) => ({ ...v, strategy: { ...result.data } }));
      toast("Brand Brainと店舗情報から戦略を提案しました");
    });

  const save = () =>
    startSave(async () => {
      const result = await saveAccountAction(account?.id ?? null, value);
      if (!result.ok) {
        setError(result.error);
        setErrors(result.fieldErrors ?? {});
        return;
      }
      toast("アカウント戦略を保存しました");
      onClose();
      router.refresh();
    });

  const remove = () =>
    startSave(async () => {
      if (!account) return;
      const result = await deleteAccountAction(account.id);
      if (!result.ok) return setError(result.error);
      toast("アカウントを削除しました");
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      wide
      title={account ? "アカウント戦略を編集" : "アカウントを追加"}
      intro="目的ごとにペルソナ・KPI・コンテンツの柱を決めると、AI投稿作成とAIマーケターがこの戦略に沿って提案します。"
      onClose={onClose}
      actions={
        <>
          {account && !account.isBrandDefault && (
            <button className="button" style={{ marginRight: "auto", color: "#c0605a" }} onClick={remove} disabled={saving}>削除</button>
          )}
          <button className="button" onClick={onClose}>キャンセル</button>
          <button className="button primary" onClick={save} disabled={saving || suggesting}>{saving && <Spinner />} 保存する</button>
        </>
      }
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      <Field label="アカウントの目的">
        <div className="goal-cards" role="radiogroup">
          {ACCOUNT_GOALS.map((g) => (
            <button key={g} type="button" role="radio" aria-checked={value.goal === g} className={`goal-card ${value.goal === g ? "selected" : ""}`}
              onClick={() => setValue((v) => ({ ...v, goal: g }))}>
              <b>{ACCOUNT_GOAL_LABELS[g]}</b>
              <span>{GOAL_PRESETS[g].description}</span>
            </button>
          ))}
        </div>
      </Field>
      <Field label="SNS" hint={account?.isBrandDefault ? "Brand Brainで登録したアカウントのため、SNSの種類は変更できません" : undefined}>
        {account?.isBrandDefault ? (
          <span className="status-pill">{PLATFORM_LABELS[value.platform]}</span>
        ) : (
          <ChoiceChips<SocialPlatform> value={value.platform} onChange={(platform) => setValue((v) => ({ ...v, platform }))}
            options={SOCIAL_PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABELS[p] }))} />
        )}
      </Field>
      <div className="two-fields">
        <Field label="アカウントID" htmlFor="accHandle" error={errors.handle}>
          <input id="accHandle" className={`input ${errors.handle ? "invalid" : ""}`} value={value.handle}
            onChange={(e) => setValue((v) => ({ ...v, handle: e.target.value }))} placeholder="@naoru_shibuya" />
        </Field>
        <Field label="表示名" htmlFor="accName" optional>
          <input id="accName" className="input" value={value.displayName} onChange={(e) => setValue((v) => ({ ...v, displayName: e.target.value }))} placeholder="渋谷院" />
        </Field>
      </div>
      <Field label="運用単位" htmlFor="accLocation" hint="店舗アカウントは店舗カスタマイズ（エリア・スタッフ・オファー）が自動で反映されます">
        <select id="accLocation" className="select" value={value.locationId ?? ""}
          onChange={(e) => setValue((v) => ({ ...v, locationId: e.target.value || null }))}>
          <option value="">本部（ブランド全体）</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Field>

      <div className="panel-heading" style={{ margin: "18px 0 10px" }}>
        <div><div className="panel-title">Account Strategy</div><div className="panel-subtitle">ペルソナ・KPI・コンテンツの柱・頻度・CTA・トーン</div></div>
        <div className="heading-actions">
          <button type="button" className="button small" onClick={() => applyPreset(value.goal)} disabled={suggesting}>目的のテンプレートを適用</button>
          <button type="button" className="button small soft" onClick={suggest} disabled={suggesting}>{suggesting ? <Spinner /> : "✳"} AIで提案</button>
        </div>
      </div>
      <Field label="ペルソナ" htmlFor="accPersona">
        <textarea id="accPersona" className="textarea" value={s.persona} onChange={(e) => setStrategy({ persona: e.target.value })}
          placeholder="例：渋谷勤務の30代女性デスクワーカー。夕方の肩こりがつらく、仕事帰りに通える整体を探している。" />
      </Field>
      <div className="two-fields">
        <Field label="KPI" htmlFor="accKpi">
          <TagInput id="accKpi" value={s.kpis} onChange={(kpis) => setStrategy({ kpis })} max={10} placeholder="例：予約数" />
        </Field>
        <Field label="コンテンツの柱" htmlFor="accPillars">
          <TagInput id="accPillars" value={s.contentPillars} onChange={(contentPillars) => setStrategy({ contentPillars })} max={10} placeholder="例：セルフケア" />
        </Field>
      </div>
      <div className="two-fields">
        <Field label="投稿頻度（週）" htmlFor="accFreq">
          <input id="accFreq" className="input" type="number" min={0} max={50} value={s.postsPerWeek}
            onChange={(e) => setStrategy({ postsPerWeek: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })} />
        </Field>
        <Field label="頻度の内訳" htmlFor="accFreqNote" optional>
          <input id="accFreqNote" className="input" value={s.postingFrequencyNote} onChange={(e) => setStrategy({ postingFrequencyNote: e.target.value })} placeholder="Reel2本・フィード2本" />
        </Field>
      </div>
      <div className="two-fields">
        <Field label="CTA" htmlFor="accCta">
          <input id="accCta" className="input" value={s.cta} onChange={(e) => setStrategy({ cta: e.target.value })} placeholder="ご予約はプロフィールのリンクから" />
        </Field>
        <Field label="トーン" htmlFor="accTone">
          <input id="accTone" className="input" value={s.tone} onChange={(e) => setStrategy({ tone: e.target.value })} placeholder="やさしく、話しかけるように" />
        </Field>
      </div>
    </Modal>
  );
}
