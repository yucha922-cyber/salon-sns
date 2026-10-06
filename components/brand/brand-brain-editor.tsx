"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import type { BrandBrainInput } from "@/lib/domain/types";
import { brandBrainCompleteness } from "@/lib/brand/context";
import { saveBrandBrainAction } from "@/app/actions/brand";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import {
  AudienceSection,
  cleanBrandBrain,
  CompanySection,
  GoalsSection,
  LocationsSection,
  ServicesSection,
  ToneSection,
} from "./sections";

const TABS = [
  { key: "basic", label: "基本情報", icon: "◎", sub: "ビジネスの基礎情報とAIの業種設定" },
  { key: "services", label: "サービス・商品", icon: "◇", sub: "メニュー、強み、競合との違い" },
  { key: "audience", label: "ターゲット", icon: "◉", sub: "お客様像と悩み" },
  { key: "brand", label: "ブランド", icon: "✧", sub: "ブランドイメージと文章トーン" },
  { key: "goals", label: "SNS・目標", icon: "▤", sub: "SNSアカウントと目標、AIへのメモ" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const yen = (n: number | null) => (n === null ? "価格未設定" : `¥${n.toLocaleString("ja-JP")}`);

function Value({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="brand-value" style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <span>{label}</span>
      <b>{children || <span className="muted">未設定</span>}</b>
    </div>
  );
}

function Tags({ items }: { items: string[] }) {
  return items.length ? (
    <div className="brand-tags">{items.map((t) => <span className="brand-tag" key={t}>{t}</span>)}</div>
  ) : (
    <span className="activity-note">未設定</span>
  );
}

export function BrandBrainEditor({
  initial,
  updatedAt,
  readOnly,
  industryGuide,
}: {
  initial: BrandBrainInput;
  updatedAt: string;
  readOnly: boolean;
  industryGuide: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>("basic");
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const { score, missing } = brandBrainCompleteness(saved);
  const onChange = (patch: Partial<BrandBrainInput>) => setDraft((d) => ({ ...d, ...patch }));

  const save = () =>
    startTransition(async () => {
      const result = await saveBrandBrainAction(cleanBrandBrain(draft));
      if (!result.ok) {
        setError(result.error);
        setErrors(result.fieldErrors ?? {});
        toast(result.error, "error");
        return;
      }
      setSaved(draft);
      setEditing(false);
      setError(null);
      setErrors({});
      toast("Brand Brainを保存しました。AIの提案に反映されます");
      router.refresh();
    });

  const cancel = () => {
    setDraft(saved);
    setEditing(false);
    setErrors({});
    setError(null);
  };

  const b = saved;
  return (
    <div className="brand-layout">
      <aside className="brand-side">
        {TABS.map((t) => (
          <button key={t.key} className={`brand-tab ${t.key === tab ? "active" : ""}`}
            onClick={() => { if (!editing) setTab(t.key); }} disabled={editing && t.key !== tab}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
        <div style={{ padding: "14px 10px 4px" }}>
          <div className="activity-note">完成度 {score}%</div>
          <div className="brand-progress" style={{ marginTop: 7 }}><i style={{ width: `${score}%` }} /></div>
          {missing.length > 0 && <div className="field-hint" style={{ marginTop: 7 }}>未入力：{missing.join("、")}</div>}
        </div>
      </aside>
      <section className="brand-main">
        <div className="brand-title-row">
          <div>
            <h2>{current.label}</h2>
            <p>{current.sub}</p>
          </div>
          {editing ? (
            <div className="heading-actions">
              <button className="button small" onClick={cancel} disabled={pending}>キャンセル</button>
              <button className="button small primary" onClick={save} disabled={pending}>{pending && <Spinner />} 保存する</button>
            </div>
          ) : (
            <div className="heading-actions">
              <span className="status-pill">最終更新 {new Date(updatedAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</span>
              {!readOnly && <button className="button small primary" onClick={() => setEditing(true)}>編集する</button>}
            </div>
          )}
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}

        {editing ? (
          <div>
            {tab === "basic" && (<><CompanySection value={draft} onChange={onChange} errors={errors} /><LocationsSection value={draft} onChange={onChange} errors={errors} /></>)}
            {tab === "services" && <ServicesSection value={draft} onChange={onChange} errors={errors} />}
            {tab === "audience" && <AudienceSection value={draft} onChange={onChange} errors={errors} />}
            {tab === "brand" && <ToneSection value={draft} onChange={onChange} errors={errors} />}
            {tab === "goals" && <GoalsSection value={draft} onChange={onChange} errors={errors} />}
          </div>
        ) : (
          <>
            {tab === "basic" && (
              <>
                <div className="brand-section">
                  <h3>ビジネスプロフィール</h3>
                  <div className="brand-value-grid">
                    <Value label="会社名">{b.companyName}</Value>
                    <Value label="ブランド名">{b.brandName}</Value>
                    <Value label="業種">{b.industry.label}</Value>
                    <Value label="Webサイト">{b.website}</Value>
                    <Value label="事業の説明" wide>{b.businessDescription}</Value>
                  </div>
                </div>
                <div className="brand-section">
                  <h3>店舗</h3>
                  <div className="brand-value-grid">
                    {b.locations.map((l, i) => <Value key={l.id ?? i} label={i === 0 ? "メイン店舗" : `店舗 ${i + 1}`}>{l.name}{l.address && <><br /><span className="muted">{l.address}</span></>}</Value>)}
                    {b.locations.length === 0 && <Value label="店舗">{""}</Value>}
                  </div>
                </div>
                <div className="brand-section">
                  <h3>AIの業種ガイド</h3>
                  <div className="recommendation-callout">
                    {industryGuide ?? "この業種にはプリセットのガイドがありません。「SNS・目標」タブのAIへの補足メモで表現ルールを追加できます。"}
                    {" "}業種設定を変更すると、生成する文章や提案の基準が変わります。
                  </div>
                </div>
              </>
            )}
            {tab === "services" && (
              <>
                <div className="brand-section">
                  <h3>サービス・商品</h3>
                  <div className="brand-value-grid">
                    {b.services.map((s) => <Value key={s.name} label={s.name}>{yen(s.price)}{s.description && <><br /><span className="muted">{s.description}</span></>}</Value>)}
                    {b.services.length === 0 && <Value label="サービス">{""}</Value>}
                  </div>
                  {b.serviceDescription && <div className="brand-value" style={{ marginTop: 9 }}><span>補足</span><b>{b.serviceDescription}</b></div>}
                </div>
                <div className="brand-section"><h3>選ばれる理由</h3><Tags items={b.strengths} /></div>
                <div className="brand-section"><h3>特徴</h3><Tags items={b.features} /></div>
                <div className="brand-section"><h3>差別化ポイント</h3><Tags items={b.differentiators} /></div>
                <div className="brand-section"><h3>競合</h3><Tags items={b.competitors.map((c) => (c.note ? `${c.name}（${c.note}）` : c.name))} /></div>
              </>
            )}
            {tab === "audience" && (
              <>
                <div className="brand-section">
                  <h3>ターゲット</h3>
                  <div className="brand-value-grid">
                    <Value label="年齢">{b.targetAudience.ageRange}</Value>
                    <Value label="性別">{b.targetAudience.gender}</Value>
                    <Value label="職業">{b.targetAudience.occupation}</Value>
                    <Value label="概要" wide>{b.targetAudience.summary}</Value>
                  </div>
                </div>
                <div className="brand-section"><h3>主な悩み</h3><Tags items={b.targetAudience.painPoints} /></div>
                <div className="brand-section"><h3>利用シーン</h3><Tags items={b.targetAudience.useCases} /></div>
                <div className="brand-section">
                  <h3>ペルソナ</h3>
                  <div className="brand-value-grid">
                    {b.personas.map((p) => <Value key={p.name} label={p.name}>{p.description}</Value>)}
                    {b.personas.length === 0 && <span className="activity-note">未設定</span>}
                  </div>
                </div>
              </>
            )}
            {tab === "brand" && (
              <>
                <div className="brand-section">
                  <h3>ブランドイメージ</h3>
                  <div className="brand-tone">
                    {b.brandPersonality.map((t, i) => <div className="tone-card" key={t}><span>イメージ 0{i + 1}</span><b>{t}</b></div>)}
                  </div>
                  {b.brandPersonality.length === 0 && <span className="activity-note">未設定</span>}
                </div>
                <div className="brand-section"><h3>発信トーン</h3><Tags items={b.brandTone} /></div>
                <div className="brand-section"><h3>文章スタイル</h3><div className="brand-value"><b>{b.writingTone || <span className="muted">未設定</span>}</b></div></div>
                <div className="brand-section">
                  <h3>参考素材</h3>
                  <div className="upload-box"><strong>＋ 参考投稿・画像を追加</strong>ファイルのアップロード（Supabase Storage）は今後対応予定です</div>
                </div>
              </>
            )}
            {tab === "goals" && (
              <>
                <div className="brand-section">
                  <h3>目標</h3>
                  <div className="brand-value-grid">
                    <Value label="事業・集客">{b.marketingGoals}</Value>
                    <Value label="SNS">{b.socialGoals}</Value>
                    <Value label="広告">{b.advertisingGoals}</Value>
                  </div>
                </div>
                <div className="brand-section">
                  <h3>SNSアカウント</h3>
                  <div className="brand-value-grid">
                    <Value label="Instagram">{b.social.instagram}</Value>
                    <Value label="Threads">{b.social.threads}</Value>
                    <Value label="TikTok">{b.social.tiktok}</Value>
                    <Value label="Facebook">{b.social.facebook}</Value>
                  </div>
                </div>
                <div className="brand-section"><h3>AIへの補足メモ</h3><div className="recommendation-callout">{b.aiContext || "未設定"}</div></div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
