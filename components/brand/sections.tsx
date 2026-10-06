"use client";

/**
 * Brand Brain form sections. The same components power the 6-step
 * onboarding and the Brand Brain editor, so both always save the same shape.
 */
import type { BrandBrainInput } from "@/lib/domain/types";
import { CUSTOM_INDUSTRY_KEY, INDUSTRY_PRESETS } from "@/lib/brand/industries";
import { Field, TagInput } from "@/components/ui/form";

export interface SectionProps {
  value: BrandBrainInput;
  onChange: (patch: Partial<BrandBrainInput>) => void;
  errors?: Record<string, string>;
  compact?: boolean;
}

const cls = (base: string, error?: string) => `${base} ${error ? "invalid" : ""}`;

export function CompanySection({ value, onChange, errors = {} }: SectionProps) {
  const isCustom = !INDUSTRY_PRESETS.some((p) => p.key === value.industry.key);
  return (
    <>
      <div className="two-fields">
        <Field label="会社名・屋号" htmlFor="companyName" error={errors.companyName}>
          <input id="companyName" className={cls("input", errors.companyName)} value={value.companyName}
            onChange={(e) => onChange({ companyName: e.target.value })} placeholder="例：NAORU 株式会社" />
        </Field>
        <Field label="ブランド名・店舗ブランド" htmlFor="brandName" error={errors.brandName}>
          <input id="brandName" className={cls("input", errors.brandName)} value={value.brandName}
            onChange={(e) => onChange({ brandName: e.target.value })} placeholder="例：NAORU整体" />
        </Field>
      </div>
      <Field label="業種" htmlFor="industry" hint="一覧にない業種は「その他」から自由に入力できます" error={errors["industry.label"]}>
        <select
          id="industry"
          className="select"
          value={isCustom ? CUSTOM_INDUSTRY_KEY : value.industry.key}
          onChange={(e) => {
            const preset = INDUSTRY_PRESETS.find((p) => p.key === e.target.value);
            onChange({ industry: preset ? { key: preset.key, label: preset.label } : { key: CUSTOM_INDUSTRY_KEY, label: "" } });
          }}
        >
          {INDUSTRY_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
          <option value={CUSTOM_INDUSTRY_KEY}>その他（自由入力）</option>
        </select>
      </Field>
      {(isCustom || value.industry.key === CUSTOM_INDUSTRY_KEY) && (
        <Field label="業種名" htmlFor="industryLabel">
          <input id="industryLabel" className="input" value={value.industry.label}
            onChange={(e) => onChange({ industry: { key: CUSTOM_INDUSTRY_KEY, label: e.target.value } })}
            placeholder="例：ヨガスタジオ、歯科クリニック" />
        </Field>
      )}
      {!isCustom && value.industry.key !== CUSTOM_INDUSTRY_KEY && (
        <Field label="業種の表記" htmlFor="industryLabel2" optional hint="例：整体 / Healthcare / Wellness">
          <input id="industryLabel2" className="input" value={value.industry.label}
            onChange={(e) => onChange({ industry: { key: value.industry.key, label: e.target.value } })} />
        </Field>
      )}
      <Field label="事業の説明" htmlFor="businessDescription" optional hint="どんなお店か、1〜2文で">
        <textarea id="businessDescription" className="textarea" value={value.businessDescription}
          onChange={(e) => onChange({ businessDescription: e.target.value })}
          placeholder="例：渋谷駅徒歩5分の完全個室の整体院。デスクワークの肩こりを根本からケアします。" />
      </Field>
      <Field label="Webサイト" htmlFor="website" optional>
        <input id="website" className="input" value={value.website} onChange={(e) => onChange({ website: e.target.value })}
          placeholder="example.com" />
      </Field>
    </>
  );
}

export function LocationsSection({ value, onChange, errors = {} }: SectionProps) {
  const rows = value.locations;
  const update = (i: number, patch: Partial<(typeof rows)[number]>) =>
    onChange({ locations: rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  return (
    <>
      <Field label="店舗" hint="複数店舗がある場合は追加してください（1行目がメイン店舗）" error={errors.locations}>
        {rows.map((row, i) => (
          <div className="repeat-row" key={row.id ?? i}>
            <input className={cls("input", errors[`locations.${i}.name`])} aria-label="店舗名" value={row.name}
              onChange={(e) => update(i, { name: e.target.value })} placeholder="店舗名（例：渋谷院）" />
            <input className="input" aria-label="住所" value={row.address}
              onChange={(e) => update(i, { address: e.target.value })} placeholder="住所・エリア（例：東京都渋谷区）" />
            <button type="button" className="icon-remove" aria-label="店舗を削除"
              onClick={() => onChange({ locations: rows.filter((_, idx) => idx !== i) })}>×</button>
          </div>
        ))}
        <button type="button" className="add-row" onClick={() => onChange({ locations: [...rows, { name: "", address: "" }] })}>
          ＋ 店舗を追加
        </button>
      </Field>
    </>
  );
}

export function ServicesSection({ value, onChange, errors = {}, compact }: SectionProps) {
  const rows = value.services;
  const update = (i: number, patch: Partial<(typeof rows)[number]>) =>
    onChange({ services: rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  return (
    <>
      <Field label="サービス・メニュー" hint="代表的なメニューを1〜3つ。価格は任意です" error={errors.services}>
        {rows.map((row, i) => (
          <div className="repeat-row three" key={i}>
            <input className={cls("input", errors[`services.${i}.name`])} aria-label="サービス名" value={row.name}
              onChange={(e) => update(i, { name: e.target.value })} placeholder="サービス名" />
            <input className="input" aria-label="内容" value={row.description}
              onChange={(e) => update(i, { description: e.target.value })} placeholder="内容（例：60分・姿勢分析つき）" />
            <input className="input" aria-label="価格（円）" inputMode="numeric" value={row.price ?? ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^\d]/g, "");
                update(i, { price: digits ? Number(digits) : null });
              }} placeholder="価格（円）" />
            <button type="button" className="icon-remove" aria-label="サービスを削除"
              onClick={() => onChange({ services: rows.filter((_, idx) => idx !== i) })}>×</button>
          </div>
        ))}
        <button type="button" className="add-row"
          onClick={() => onChange({ services: [...rows, { name: "", description: "", price: null }] })}>
          ＋ サービスを追加
        </button>
      </Field>
      <Field label="選ばれる理由・強み" hint="Enterで追加" htmlFor="strengths">
        <TagInput id="strengths" value={value.strengths} onChange={(strengths) => onChange({ strengths })}
          placeholder="例：国家資格保有者が担当" suggestions={["完全個室", "駅近", "夜21時まで営業", "女性スタッフ在籍", "初回カウンセリング無料"]} />
      </Field>
      {!compact && (
        <>
          <Field label="サービスの補足説明" htmlFor="serviceDescription" optional>
            <textarea id="serviceDescription" className="textarea" value={value.serviceDescription}
              onChange={(e) => onChange({ serviceDescription: e.target.value })} placeholder="営業時間、予約方法、こだわりなど" />
          </Field>
          <Field label="特徴" htmlFor="features" optional>
            <TagInput id="features" value={value.features} onChange={(features) => onChange({ features })} placeholder="例：LINEで簡単予約" />
          </Field>
          <Field label="競合との違い（差別化ポイント）" htmlFor="differentiators" optional>
            <TagInput id="differentiators" value={value.differentiators} onChange={(differentiators) => onChange({ differentiators })}
              placeholder="例：データで変化を可視化" />
          </Field>
          <CompetitorsField value={value} onChange={onChange} />
        </>
      )}
    </>
  );
}

function CompetitorsField({ value, onChange }: SectionProps) {
  const rows = value.competitors;
  const update = (i: number, patch: Partial<(typeof rows)[number]>) =>
    onChange({ competitors: rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  return (
    <Field label="競合" optional>
      {rows.map((row, i) => (
        <div className="repeat-row" key={i}>
          <input className="input" aria-label="競合名" value={row.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="競合名" />
          <input className="input" aria-label="メモ" value={row.note} onChange={(e) => update(i, { note: e.target.value })} placeholder="特徴メモ" />
          <button type="button" className="icon-remove" aria-label="競合を削除"
            onClick={() => onChange({ competitors: rows.filter((_, idx) => idx !== i) })}>×</button>
        </div>
      ))}
      <button type="button" className="add-row" onClick={() => onChange({ competitors: [...rows, { name: "", note: "" }] })}>
        ＋ 競合を追加
      </button>
    </Field>
  );
}

export function AudienceSection({ value, onChange, compact }: SectionProps) {
  const ta = value.targetAudience;
  const set = (patch: Partial<typeof ta>) => onChange({ targetAudience: { ...ta, ...patch } });
  return (
    <>
      <div className="two-fields">
        <Field label="年齢層" htmlFor="ageRange">
          <input id="ageRange" className="input" value={ta.ageRange} onChange={(e) => set({ ageRange: e.target.value })} placeholder="例：30代" />
        </Field>
        <Field label="性別" htmlFor="gender" optional>
          <input id="gender" className="input" value={ta.gender} onChange={(e) => set({ gender: e.target.value })} placeholder="例：女性中心" />
        </Field>
      </div>
      <Field label="職業・ライフスタイル" htmlFor="occupation">
        <input id="occupation" className="input" value={ta.occupation} onChange={(e) => set({ occupation: e.target.value })}
          placeholder="例：渋谷勤務のデスクワーカー" />
      </Field>
      <Field label="お客様の悩み" hint="Enterで追加。AIが投稿のフックに使います" htmlFor="painPoints">
        <TagInput id="painPoints" value={ta.painPoints} onChange={(painPoints) => set({ painPoints })}
          placeholder="例：肩こり" suggestions={["肩こり", "首こり", "姿勢の崩れ", "仕事終わりの疲れ", "腰痛", "むくみ"]} />
      </Field>
      {!compact && (
        <>
          <Field label="ターゲットの概要" htmlFor="audienceSummary" optional>
            <input id="audienceSummary" className="input" value={ta.summary} onChange={(e) => set({ summary: e.target.value })}
              placeholder="例：渋谷・表参道エリアで働く会社員" />
          </Field>
          <Field label="利用シーン" htmlFor="useCases" optional>
            <TagInput id="useCases" value={ta.useCases} onChange={(useCases) => set({ useCases })} placeholder="例：仕事帰りのリフレッシュ" />
          </Field>
        </>
      )}
      <PersonasField value={value} onChange={onChange} />
    </>
  );
}

function PersonasField({ value, onChange }: SectionProps) {
  const rows = value.personas;
  const update = (i: number, patch: Partial<(typeof rows)[number]>) =>
    onChange({ personas: rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  return (
    <Field label="ペルソナ" optional hint="具体的なお客様像（例：仕事帰りに通いたい32歳の会社員）">
      {rows.map((row, i) => (
        <div className="repeat-row" key={i}>
          <input className="input" aria-label="ペルソナ名" value={row.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="ペルソナ名" />
          <input className="input" aria-label="説明" value={row.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="説明" />
          <button type="button" className="icon-remove" aria-label="ペルソナを削除"
            onClick={() => onChange({ personas: rows.filter((_, idx) => idx !== i) })}>×</button>
        </div>
      ))}
      <button type="button" className="add-row" onClick={() => onChange({ personas: [...rows, { name: "", description: "" }] })}>
        ＋ ペルソナを追加
      </button>
    </Field>
  );
}

export function ToneSection({ value, onChange }: SectionProps) {
  return (
    <>
      <Field label="ブランドイメージ" hint="お客様にどう感じてほしいか" htmlFor="brandPersonality">
        <TagInput id="brandPersonality" value={value.brandPersonality} onChange={(brandPersonality) => onChange({ brandPersonality })}
          placeholder="例：清潔感" suggestions={["清潔感", "専門性", "都会的", "親しみやすい", "上品", "ナチュラル", "元気"]} max={12} />
      </Field>
      <Field label="発信トーン" htmlFor="brandTone">
        <TagInput id="brandTone" value={value.brandTone} onChange={(brandTone) => onChange({ brandTone })}
          placeholder="例：やさしく、話しかけるように"
          suggestions={["やさしく、話しかけるように", "専門用語はわかりやすく", "過度な効果保証を避ける", "簡潔に", "絵文字は控えめ"]} max={12} />
      </Field>
      <Field label="文章スタイル" htmlFor="writingTone" optional hint="AIが文章を書くときの具体的なルール">
        <textarea id="writingTone" className="textarea" value={value.writingTone} onChange={(e) => onChange({ writingTone: e.target.value })}
          placeholder="例：専門家としての信頼感を保ちつつ、友人に話しかけるような文体。絵文字は1投稿2つまで。" />
      </Field>
    </>
  );
}

export function GoalsSection({ value, onChange, compact }: SectionProps) {
  const social = value.social;
  const setSocial = (patch: Partial<typeof social>) => onChange({ social: { ...social, ...patch } });
  return (
    <>
      <Field label="事業・集客の目標" htmlFor="marketingGoals">
        <input id="marketingGoals" className="input" value={value.marketingGoals} onChange={(e) => onChange({ marketingGoals: e.target.value })}
          placeholder="例：新規体験予約を月40件獲得する" />
      </Field>
      <div className="two-fields">
        <Field label="SNSの目的" htmlFor="socialGoals" optional>
          <input id="socialGoals" className="input" value={value.socialGoals} onChange={(e) => onChange({ socialGoals: e.target.value })}
            placeholder="例：保存数とプロフィール遷移を増やす" />
        </Field>
        <Field label="広告の目的" htmlFor="advertisingGoals" optional>
          <input id="advertisingGoals" className="input" value={value.advertisingGoals}
            onChange={(e) => onChange({ advertisingGoals: e.target.value })} placeholder="例：CPA ¥7,000以下で新規獲得" />
        </Field>
      </div>
      <Field label="SNSアカウント" optional hint="アカウント連携は今後対応予定です。いまはAIが参考にするためのIDのみ登録します">
        <div className="two-fields">
          {(["instagram", "threads", "tiktok", "facebook"] as const).map((p) => (
            <input key={p} className="input" aria-label={p} value={social[p]} onChange={(e) => setSocial({ [p]: e.target.value })}
              placeholder={`${p === "facebook" ? "Facebook" : p === "tiktok" ? "TikTok" : p === "threads" ? "Threads" : "Instagram"} @id`}
              style={{ marginBottom: 8 }} />
          ))}
        </div>
      </Field>
      {!compact && (
        <Field label="AIへの補足メモ" htmlFor="aiContext" optional hint="AIが常に意識すべきこと（使ってはいけない表現、キャンペーン情報など）">
          <textarea id="aiContext" className="textarea" value={value.aiContext} onChange={(e) => onChange({ aiContext: e.target.value })}
            placeholder="例：初回カウンセリングを入口にする。「治る」など医療的な断定表現は使わない。" />
        </Field>
      )}
    </>
  );
}

/** Drops blank repeat rows before saving so validation doesn't trip on empty lines. */
export function cleanBrandBrain(value: BrandBrainInput): BrandBrainInput {
  return {
    ...value,
    locations: value.locations.filter((l) => l.name.trim()),
    services: value.services.filter((s) => s.name.trim()),
    competitors: value.competitors.filter((c) => c.name.trim()),
    personas: value.personas.filter((p) => p.name.trim()),
  };
}
