"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AccountGoal, ContentPillar, KpiTarget, SnsAccount, SnsAccountInput, SocialPlatform } from "@/lib/domain/types";
import { ACCOUNT_GOALS, SOCIAL_PLATFORMS } from "@/lib/domain/types";
import { ACCOUNT_GOAL_LABELS, PLATFORM_LABELS, WEEKDAY_LABELS } from "@/lib/domain/labels";
import { GOAL_PRESETS, presetStrategy } from "@/lib/brand/account-goals";
import { pillarLabel } from "@/lib/brand/content-pillars";
import { strategyFromProposal } from "@/lib/brand/apply-strategy";
import type { AccountStrategistOutput } from "@/lib/ai/schemas";
import { createContentPillarAction, deleteAccountAction, runAccountStrategistAction, saveAccountAction } from "@/app/actions/strategy";
import { Modal } from "@/components/ui/modal";
import { ChoiceChips, Field, TagInput } from "@/components/ui/form";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

export function newAccountInput(goal: AccountGoal = "acquisition", locationId: string | null = null): SnsAccountInput {
  return {
    platform: "instagram",
    handle: "",
    displayName: "",
    locationId,
    goal,
    customGoal: "",
    active: true,
    strategy: presetStrategy(goal),
  };
}

export function toAccountInput(a: SnsAccount): SnsAccountInput {
  return {
    platform: a.platform,
    handle: a.handle,
    displayName: a.displayName,
    locationId: a.locationId,
    goal: a.goal,
    customGoal: a.customGoal,
    active: a.active,
    strategy: structuredClone(a.strategy),
  };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function AccountEditor({
  account,
  initial,
  locations,
  pillars: initialPillars,
  onClose,
}: {
  account: SnsAccount | null;
  initial: SnsAccountInput;
  locations: { id: string; name: string }[];
  pillars: ContentPillar[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState<SnsAccountInput>(initial);
  const [pillars, setPillars] = useState(initialPillars);
  const [customPillar, setCustomPillar] = useState("");
  const [proposal, setProposal] = useState<AccountStrategistOutput | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [thinking, startThinking] = useTransition();
  const s = value.strategy;
  const setStrategy = (patch: Partial<SnsAccountInput["strategy"]>) => setValue((v) => ({ ...v, strategy: { ...v.strategy, ...patch } }));
  const setKpi = (i: number, patch: Partial<KpiTarget>) => setStrategy({ kpiTargets: s.kpiTargets.map((k, idx) => (idx === i ? { ...k, ...patch } : k)) });
  const goalPillars = pillars.filter((p) => p.goal === value.goal);
  const otherSelected = s.contentPillars.filter((key) => !goalPillars.some((p) => p.key === key));
  const togglePillar = (key: string) =>
    setStrategy({ contentPillars: s.contentPillars.includes(key) ? s.contentPillars.filter((k) => k !== key) : [...s.contentPillars, key] });

  const applyPreset = () => setValue((v) => ({ ...v, strategy: { ...presetStrategy(v.goal), persona: v.strategy.persona, targetAudience: v.strategy.targetAudience, notes: v.strategy.notes } }));

  const addCustomPillar = () =>
    startSave(async () => {
      const result = await createContentPillarAction({ goal: value.goal, label: customPillar, description: "" });
      if (!result.ok) return toast(result.error, "error");
      setPillars((list) => (list.some((p) => p.key === result.data.key) ? list : [...list, result.data]));
      if (!s.contentPillars.includes(result.data.key)) setStrategy({ contentPillars: [...s.contentPillars, result.data.key] });
      setCustomPillar("");
    });

  const runStrategist = () =>
    startThinking(async () => {
      const result = await runAccountStrategistAction({ ...value, handle: value.handle || "@new_account" });
      if (!result.ok) return toast(result.error, "error");
      setProposal(result.data);
    });

  const applyProposal = () => {
    if (!proposal) return;
    setValue((v) => ({ ...v, strategy: strategyFromProposal(proposal, v.strategy, pillars) }));
    setProposal(null);
    toast("AIの提案を適用しました。内容を確認して保存してください");
  };

  const save = () =>
    startSave(async () => {
      const result = await saveAccountAction(account?.id ?? null, {
        ...value,
        strategy: { ...s, kpiTargets: s.kpiTargets.filter((k) => k.metric.trim()) },
      });
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
      title={account ? "アカウント戦略を編集" : "SNSアカウントを追加"}
      intro="「このアカウントは何のために運用するのか」を決めると、AIの月間計画・投稿作成がこの戦略に沿って動きます。"
      onClose={onClose}
      actions={
        <>
          {account && !account.isBrandDefault && (
            <button className="button" style={{ marginRight: "auto", color: "#c0605a" }} onClick={remove} disabled={saving}>削除</button>
          )}
          <button className="button" onClick={onClose}>キャンセル</button>
          <button className="button primary" onClick={save} disabled={saving || thinking}>{saving && <Spinner />} 保存する</button>
        </>
      }
    >
      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="two-fields">
        <Field label="SNS" hint={account?.isBrandDefault ? "Brand Brainで登録したアカウントのため変更できません" : undefined}>
          {account?.isBrandDefault ? (
            <span className="status-pill">{PLATFORM_LABELS[value.platform]}</span>
          ) : (
            <ChoiceChips<SocialPlatform> value={value.platform} onChange={(platform) => setValue((v) => ({ ...v, platform }))}
              options={SOCIAL_PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABELS[p] }))} />
          )}
        </Field>
        <Field label="運用単位" htmlFor="accLocation">
          <select id="accLocation" className="select" value={value.locationId ?? ""} onChange={(e) => setValue((v) => ({ ...v, locationId: e.target.value || null }))}>
            <option value="">本部アカウント（店舗に紐づかない）</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="two-fields">
        <Field label="アカウントID" htmlFor="accHandle" error={errors.handle}>
          <input id="accHandle" className={`input ${errors.handle ? "invalid" : ""}`} value={value.handle} onChange={(e) => setValue((v) => ({ ...v, handle: e.target.value }))} placeholder="@naoru_shibuya" />
        </Field>
        <Field label="アカウント名" htmlFor="accName" optional>
          <input id="accName" className="input" value={value.displayName} onChange={(e) => setValue((v) => ({ ...v, displayName: e.target.value }))} placeholder="渋谷院 Instagram" />
        </Field>
      </div>

      <Field label="運用目的（Primary Goal）">
        <div className="goal-cards goal-cards-6" role="radiogroup">
          {ACCOUNT_GOALS.map((g) => (
            <button key={g} type="button" role="radio" aria-checked={value.goal === g} className={`goal-card ${value.goal === g ? "selected" : ""} ${g === "acquisition" || g === "recruitment" ? "goal-card-key" : ""}`}
              onClick={() => setValue((v) => ({ ...v, goal: g }))}>
              <b>{ACCOUNT_GOAL_LABELS[g]}</b>
              <span>{GOAL_PRESETS[g].description}</span>
            </button>
          ))}
        </div>
      </Field>
      {value.goal === "custom" && (
        <Field label="カスタム目的" htmlFor="accCustomGoal">
          <input id="accCustomGoal" className="input" value={value.customGoal} onChange={(e) => setValue((v) => ({ ...v, customGoal: e.target.value }))} placeholder="例：新メニューの認知拡大" />
        </Field>
      )}
      <label className="check-item" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={value.active} onChange={(e) => setValue((v) => ({ ...v, active: e.target.checked }))} />
        このアカウントを運用中にする（停止中はAI計画・集計の対象外）
      </label>

      <div className="strategist-box">
        <div className="panel-heading" style={{ marginBottom: 8 }}>
          <div>
            <div className="panel-title">✳ AI Account Strategist</div>
            <div className="panel-subtitle">Brand Brain・店舗情報・目的から、このアカウントの運用戦略を提案します</div>
          </div>
          <div className="heading-actions">
            <button type="button" className="button small" onClick={applyPreset} disabled={thinking}>目的のテンプレート</button>
            <button type="button" className="button small primary" onClick={runStrategist} disabled={thinking}>{thinking ? <><Spinner /> 分析中…</> : "AIに戦略を提案してもらう"}</button>
          </div>
        </div>
        {proposal && (
          <div className="strategist-proposal" aria-label="AIの戦略提案">
            <div className="strategy-line"><b>Goal</b>{proposal.goal}</div>
            <div className="strategy-line"><b>Target</b>{proposal.targetAudience}</div>
            <div className="strategy-line"><b>Persona</b>{proposal.targetPersona}</div>
            <div className="strategy-line"><b>Primary KPI</b>{proposal.primaryKpi.metric}{proposal.primaryKpi.target !== null ? ` ${proposal.primaryKpi.target}${proposal.primaryKpi.unit}` : ""}</div>
            <div className="strategy-line"><b>Secondary KPI</b>{proposal.secondaryKpis.map((k) => `${k.metric}${k.target !== null ? ` ${k.target}${k.unit}` : ""}`).join("・") || "—"}</div>
            <div className="strategy-line"><b>Content Pillars</b>{proposal.recommendedContentPillars.map((p) => p.label).join("・")}</div>
            <div className="strategy-line"><b>Frequency</b>週{proposal.recommendedPostsPerWeek}本（{proposal.postingFrequencyNote}）/ {proposal.recommendedPostingDays.map((d) => WEEKDAY_LABELS[d]).join("・")} {proposal.recommendedPostingTimes.join("・")}</div>
            <div className="strategy-line"><b>CTA Strategy</b>{proposal.ctaStrategy}</div>
            <div className="strategy-line"><b>Tone</b>{proposal.tone}</div>
            <div className="strategy-line"><b>Monthly Mix</b>{proposal.monthlyContentMix.map((m) => `${m.pillar} ${m.sharePercent}%（${m.funnelStage}）`).join(" / ")}</div>
            <div className="strategy-line"><b>Risks</b>{proposal.risks.join(" / ") || "—"}</div>
            <div className="strategy-line"><b>Suggestions</b>{proposal.suggestions.join(" / ") || "—"}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" className="button small" onClick={() => setProposal(null)}>破棄</button>
              <button type="button" className="button small soft" onClick={applyProposal}>この提案をフォームに適用</button>
            </div>
          </div>
        )}
      </div>

      <div className="two-fields">
        <Field label="ターゲット" htmlFor="accTarget">
          <input id="accTarget" className="input" value={s.targetAudience} onChange={(e) => setStrategy({ targetAudience: e.target.value })} placeholder="例：30代女性 / 渋谷勤務 / デスクワーク" />
        </Field>
        <Field label="CTA戦略" htmlFor="accCta">
          <input id="accCta" className="input" value={s.cta} onChange={(e) => setStrategy({ cta: e.target.value })} placeholder="例：LINE予約 / プロフィールリンク" />
        </Field>
      </div>
      <Field label="ペルソナ" htmlFor="accPersona">
        <textarea id="accPersona" className="textarea" value={s.persona} onChange={(e) => setStrategy({ persona: e.target.value })}
          placeholder="例：IT企業勤務・32歳。夕方になると肩と首が重く、仕事帰りに通える整体を探している。" />
      </Field>

      <Field label="KPI目標" hint="目標値は空欄でも保存できます">
        {s.kpiTargets.map((k, i) => (
          <div className="repeat-row three" key={i}>
            <input className="input" aria-label="KPI名" value={k.metric} onChange={(e) => setKpi(i, { metric: e.target.value })} placeholder="例：予約数" />
            <input className="input" aria-label="目標値" inputMode="numeric" value={k.target ?? ""}
              onChange={(e) => { const d = e.target.value.replace(/[^\d.]/g, ""); setKpi(i, { target: d ? Number(d) : null }); }} placeholder="目標値" />
            <input className="input" aria-label="単位" value={k.unit} onChange={(e) => setKpi(i, { unit: e.target.value })} placeholder="件/月" />
            <button type="button" className="icon-remove" aria-label="KPIを削除" onClick={() => setStrategy({ kpiTargets: s.kpiTargets.filter((_, idx) => idx !== i) })}>×</button>
          </div>
        ))}
        <button type="button" className="add-row" onClick={() => setStrategy({ kpiTargets: [...s.kpiTargets, { metric: "", target: null, unit: "" }] })}>＋ KPIを追加</button>
      </Field>

      <Field label="コンテンツの柱（Content Pillars）" hint={`${ACCOUNT_GOAL_LABELS[value.goal]}向けのライブラリ。クリックで選択`}>
        <div className="chip-options">
          {goalPillars.map((p) => (
            <button key={p.id} type="button" className={`choice-chip ${s.contentPillars.includes(p.key) ? "selected" : ""}`} onClick={() => togglePillar(p.key)} title={p.description} aria-pressed={s.contentPillars.includes(p.key)}>
              {p.label}{!p.isSystem && " ★"}
            </button>
          ))}
          {otherSelected.map((key) => (
            <button key={key} type="button" className="choice-chip selected" onClick={() => togglePillar(key)} aria-pressed>
              {pillarLabel(key, pillars)} ×
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input className="input" aria-label="カスタムの柱" value={customPillar} onChange={(e) => setCustomPillar(e.target.value)} placeholder="カスタムの柱を追加（例：渋谷ランチ後ケア）" />
          <button type="button" className="button small" onClick={addCustomPillar} disabled={!customPillar.trim() || saving}>追加</button>
        </div>
      </Field>

      <div className="two-fields">
        <Field label="投稿頻度（週）" htmlFor="accFreq">
          <input id="accFreq" className="input" type="number" min={0} max={50} value={s.postsPerWeek}
            onChange={(e) => setStrategy({ postsPerWeek: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })} />
        </Field>
        <Field label="頻度の内訳" htmlFor="accFreqNote" optional>
          <input id="accFreqNote" className="input" value={s.postingFrequencyNote} onChange={(e) => setStrategy({ postingFrequencyNote: e.target.value })} placeholder="Reel2本・カルーセル2本" />
        </Field>
      </div>
      <div className="two-fields">
        <Field label="投稿曜日">
          <div className="chip-options">
            {WEEKDAY_LABELS.map((label, d) => (
              <button key={label} type="button" className={`choice-chip ${s.preferredPostingDays.includes(d) ? "selected" : ""}`} aria-pressed={s.preferredPostingDays.includes(d)}
                onClick={() => setStrategy({ preferredPostingDays: s.preferredPostingDays.includes(d) ? s.preferredPostingDays.filter((x) => x !== d) : [...s.preferredPostingDays, d].sort() })}>
                {label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="投稿時間" htmlFor="accTimes" hint="HH:MM（Enterで追加）" error={errors["strategy.preferredPostingTimes.0"]}>
          <TagInput id="accTimes" value={s.preferredPostingTimes} max={6} suggestions={["08:00", "12:00", "19:00", "20:00", "21:00"]}
            onChange={(times) => setStrategy({ preferredPostingTimes: times.filter((t) => TIME_RE.test(t)) })} placeholder="20:00" />
        </Field>
      </div>
      <div className="two-fields">
        <Field label="トーン" htmlFor="accTone">
          <input id="accTone" className="input" value={s.tone} onChange={(e) => setStrategy({ tone: e.target.value })} placeholder="やさしく、話しかけるように" />
        </Field>
        <Field label="メモ" htmlFor="accNotes" optional>
          <input id="accNotes" className="input" value={s.notes} onChange={(e) => setStrategy({ notes: e.target.value })} placeholder="NG表現、運用担当など" />
        </Field>
      </div>
    </Modal>
  );
}
