"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { LocationProfile, LocationProfileInput, SnsAccount } from "@/lib/domain/types";
import { ACCOUNT_GOAL_LABELS } from "@/lib/domain/labels";
import { saveLocationProfileAction } from "@/app/actions/strategy";
import { Field, TagInput } from "@/components/ui/form";
import { EmptyState, Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

function toInput(p: LocationProfile): LocationProfileInput {
  return { area: p.area, demographics: p.demographics, featuredServices: p.featuredServices, staff: p.staff, offers: p.offers, localKeywords: p.localKeywords };
}

export function LocationCustomizer({
  profiles,
  services,
  accounts,
  readOnly,
}: {
  profiles: LocationProfile[];
  services: string[];
  accounts: SnsAccount[];
  readOnly: boolean;
}) {
  const [selectedId, setSelectedId] = useState(profiles[0]?.locationId ?? null);
  const selected = profiles.find((p) => p.locationId === selectedId) ?? null;

  if (!profiles.length) {
    return (
      <div className="panel">
        <EmptyState icon="⌂" title="店舗が登録されていません" description="Brand Brainの「基本情報」で店舗を追加すると、店舗ごとのカスタマイズができます。"
          action={{ label: "Brand Brainで店舗を追加", href: "/brand" }} />
      </div>
    );
  }

  return (
    <div className="brand-layout">
      <aside className="brand-side">
        {profiles.map((p) => {
          const filled = [p.area, p.demographics].filter(Boolean).length + (p.staff.length ? 1 : 0) + (p.localKeywords.length ? 1 : 0);
          return (
            <button key={p.locationId} className={`side-list-item ${p.locationId === selectedId ? "active" : ""}`} onClick={() => setSelectedId(p.locationId)}>
              <b>{p.locationName}</b>
              <small>{p.area || "エリア未設定"} · 設定 {filled}/4</small>
            </button>
          );
        })}
        <Link className="button small" style={{ margin: "10px 10px 4px" }} href="/brand">＋ 店舗を追加（Brand Brain）</Link>
      </aside>
      {selected && (
        <LocationForm
          key={selected.locationId}
          profile={selected}
          services={services}
          accounts={accounts.filter((a) => a.locationId === selected.locationId)}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}

function LocationForm({ profile, services, accounts, readOnly }: { profile: LocationProfile; services: string[]; accounts: SnsAccount[]; readOnly: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(toInput(profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<LocationProfileInput>) => setValue((v) => ({ ...v, ...patch }));
  const updateStaff = (i: number, patch: Partial<LocationProfileInput["staff"][number]>) =>
    set({ staff: value.staff.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });

  const save = () =>
    startTransition(async () => {
      const result = await saveLocationProfileAction(profile.locationId, { ...value, staff: value.staff.filter((s) => s.name.trim()) });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        return toast(result.error, "error");
      }
      setErrors({});
      toast(`${profile.locationName}の店舗情報を保存しました`);
      router.refresh();
    });

  return (
    <section className="brand-main">
      <div className="brand-title-row">
        <div>
          <h2>{profile.locationName}</h2>
          <p>{profile.address || "住所未設定"} · AIが店舗向けに投稿をローカライズするときに使います</p>
        </div>
        {!readOnly && <button className="button small primary" onClick={save} disabled={pending}>{pending && <Spinner />} 保存する</button>}
      </div>
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="two-fields">
          <Field label="エリア" htmlFor="locArea" error={errors.area}>
            <input id="locArea" className="input" value={value.area} onChange={(e) => set({ area: e.target.value })} placeholder="例：渋谷・表参道" />
          </Field>
          <Field label="ローカルキーワード" htmlFor="locKeywords" hint="ハッシュタグや本文に使われます">
            <TagInput id="locKeywords" value={value.localKeywords} onChange={(localKeywords) => set({ localKeywords })} placeholder="例：渋谷整体" />
          </Field>
        </div>
        <Field label="商圏・客層（Demographics）" htmlFor="locDemo">
          <textarea id="locDemo" className="textarea" value={value.demographics} onChange={(e) => set({ demographics: e.target.value })}
            placeholder="例：20代後半〜40代のオフィスワーカー。女性比率が高く、仕事帰りの来店が多い。" />
        </Field>
        <Field label="この店舗で注力するサービス" htmlFor="locServices" optional>
          <TagInput id="locServices" value={value.featuredServices} onChange={(featuredServices) => set({ featuredServices })} suggestions={services} placeholder="サービス名" />
        </Field>
        <Field label="店舗独自のオファー" htmlFor="locOffers" optional hint="本部キャンペーンのローカライズ時に追記されます">
          <TagInput id="locOffers" value={value.offers} onChange={(offers) => set({ offers })} placeholder="例：平日19時以降+10分延長" />
        </Field>
        <Field label="スタッフ" optional error={errors["staff.0.name"]}>
          {value.staff.map((s, i) => (
            <div className="repeat-row three" key={i}>
              <input className="input" aria-label="スタッフ名" value={s.name} onChange={(e) => updateStaff(i, { name: e.target.value })} placeholder="名前" />
              <input className="input" aria-label="得意分野" value={s.specialty} onChange={(e) => updateStaff(i, { specialty: e.target.value })} placeholder="得意分野" />
              <input className="input" aria-label="役職" value={s.role} onChange={(e) => updateStaff(i, { role: e.target.value })} placeholder="役職" />
              <button type="button" className="icon-remove" aria-label="スタッフを削除" onClick={() => set({ staff: value.staff.filter((_, idx) => idx !== i) })}>×</button>
            </div>
          ))}
          <button type="button" className="add-row" onClick={() => set({ staff: [...value.staff, { name: "", role: "", specialty: "" }] })}>＋ スタッフを追加</button>
        </Field>
      </fieldset>
      <div className="brand-section" style={{ marginTop: 14 }}>
        <h3>この店舗のアカウント</h3>
        {accounts.length ? (
          <div className="brand-tags">{accounts.map((a) => <span className="brand-tag" key={a.id}>{a.handle}（{ACCOUNT_GOAL_LABELS[a.goal]}）</span>)}</div>
        ) : (
          <p className="activity-note">店舗アカウントは未登録です。<Link className="link-button" href="/accounts">アカウント戦略</Link>で追加できます（未登録の場合は本部アカウント向けに作成します）。</p>
        )}
      </div>
    </section>
  );
}
