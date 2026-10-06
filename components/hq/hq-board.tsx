"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { HqCampaign, HqCampaignInput, Post } from "@/lib/domain/types";
import { HQ_CAMPAIGN_STATUSES } from "@/lib/domain/types";
import { HQ_STATUS_LABELS, POST_STATUS_LABELS, POST_STATUS_PILL } from "@/lib/domain/labels";
import { deleteHqCampaignAction, localizeHqCampaignAction, saveHqCampaignAction } from "@/app/actions/strategy";
import type { LocalizationResult } from "@/lib/services/localization";
import { Field, TagInput } from "@/components/ui/form";
import { EmptyState, Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { formatSchedule } from "@/components/posts/post-row";

const RULE_SUGGESTIONS = [
  "見出しとキャンペーン名は本部の表記を変えない",
  "冒頭に店舗のエリア名を入れる",
  "店舗独自のオファーがあれば最後に1つだけ追記する",
  "ハッシュタグに店舗のローカルキーワードを必ず含める",
  "スタッフ名を1名入れる",
  "効果の断定表現は使わない",
];

const EMPTY: HqCampaignInput = {
  name: "",
  status: "draft",
  startsOn: null,
  endsOn: null,
  sharedTheme: "",
  creative: { headline: "", body: "", visual: "" },
  localizationRules: RULE_SUGGESTIONS.slice(0, 4),
  targetLocationIds: [],
};

function toInput(c: HqCampaign): HqCampaignInput {
  const { id: _id, createdAt: _c, ...input } = c;
  return input;
}

export function HqBoard({
  campaigns,
  locations,
  postsByCampaign,
  readOnly,
}: {
  campaigns: HqCampaign[];
  locations: { id: string; name: string; configured: boolean }[];
  postsByCampaign: Record<string, (Post & { locationName: string })[]>;
  readOnly: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | "new" | null>(campaigns[0]?.id ?? (readOnly ? null : "new"));
  const selected = campaigns.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="brand-layout">
      <aside className="brand-side">
        {!readOnly && (
          <button className={`side-list-item ${selectedId === "new" ? "active" : ""}`} onClick={() => setSelectedId("new")}>
            <b>＋ 新しい本部キャンペーン</b>
            <small>共通テーマとクリエイティブを作成</small>
          </button>
        )}
        {campaigns.map((c) => (
          <button key={c.id} className={`side-list-item ${c.id === selectedId ? "active" : ""}`} onClick={() => setSelectedId(c.id)}>
            <b>{c.name}</b>
            <small>{HQ_STATUS_LABELS[c.status]} · {c.targetLocationIds.length ? `${c.targetLocationIds.length}店舗` : "全店舗"} · 下書き{postsByCampaign[c.id]?.length ?? 0}件</small>
          </button>
        ))}
      </aside>
      {selectedId === null ? (
        <section className="brand-main">
          <EmptyState icon="▣" title="本部キャンペーンはまだありません" description="本部で共通テーマとクリエイティブを決め、各店舗向けに自動でローカライズできます。" />
        </section>
      ) : (
        <CampaignEditor
          key={selected?.id ?? "new"}
          campaign={selected}
          locations={locations}
          posts={selected ? (postsByCampaign[selected.id] ?? []) : []}
          readOnly={readOnly}
          onSaved={(id) => setSelectedId(id)}
          onDeleted={() => setSelectedId(campaigns.find((c) => c.id !== selected?.id)?.id ?? "new")}
        />
      )}
    </div>
  );
}

function CampaignEditor({
  campaign,
  locations,
  posts,
  readOnly,
  onSaved,
  onDeleted,
}: {
  campaign: HqCampaign | null;
  locations: { id: string; name: string; configured: boolean }[];
  posts: (Post & { locationName: string })[];
  readOnly: boolean;
  onSaved: (id: string) => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState<HqCampaignInput>(campaign ? toInput(campaign) : EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<LocalizationResult | null>(null);
  const [saving, startSave] = useTransition();
  const [localizing, startLocalize] = useTransition();
  const set = (patch: Partial<HqCampaignInput>) => setValue((v) => ({ ...v, ...patch }));
  const allLocations = value.targetLocationIds.length === 0;
  const toggleLocation = (id: string) =>
    set({
      targetLocationIds: value.targetLocationIds.includes(id)
        ? value.targetLocationIds.filter((x) => x !== id)
        : [...value.targetLocationIds, id],
    });
  const targetCount = allLocations ? locations.length : value.targetLocationIds.length;

  const save = () =>
    startSave(async () => {
      const r = await saveHqCampaignAction(campaign?.id ?? null, value);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        return toast(r.error, "error");
      }
      setErrors({});
      toast("本部キャンペーンを保存しました");
      onSaved(r.data.id);
      router.refresh();
    });

  const remove = () =>
    startSave(async () => {
      if (!campaign) return;
      const r = await deleteHqCampaignAction(campaign.id);
      if (!r.ok) return toast(r.error, "error");
      toast("本部キャンペーンを削除しました");
      onDeleted();
      router.refresh();
    });

  const localize = () =>
    startLocalize(async () => {
      if (!campaign) return;
      const r = await localizeHqCampaignAction(campaign.id);
      if (!r.ok) return toast(r.error, "error");
      setResult(r.data);
      toast(`${r.data.created.length}店舗分の下書きを作成しました`);
      router.refresh();
    });

  return (
    <section className="brand-main">
      <div className="brand-title-row">
        <div>
          <h2>{campaign ? campaign.name : "新しい本部キャンペーン"}</h2>
          <p>HQ campaign · shared content theme · shared creative · localization rules</p>
        </div>
        {!readOnly && (
          <div className="heading-actions">
            {campaign && <button className="button small" style={{ color: "#c0605a" }} onClick={remove} disabled={saving}>削除</button>}
            <button className="button small primary" onClick={save} disabled={saving}>{saving && <Spinner />} 保存する</button>
          </div>
        )}
      </div>
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="brand-section">
          <h3>HQ Campaign</h3>
          <Field label="キャンペーン名" htmlFor="hqName" error={errors.name}>
            <input id="hqName" className={`input ${errors.name ? "invalid" : ""}`} value={value.name} onChange={(e) => set({ name: e.target.value })} placeholder="例：秋の姿勢改善キャンペーン" />
          </Field>
          <div className="two-fields">
            <Field label="期間" htmlFor="hqStart" error={errors.endsOn}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input id="hqStart" className="input" type="date" value={value.startsOn ?? ""} onChange={(e) => set({ startsOn: e.target.value || null })} />
                <span className="muted">〜</span>
                <input aria-label="終了日" className="input" type="date" value={value.endsOn ?? ""} onChange={(e) => set({ endsOn: e.target.value || null })} />
              </div>
            </Field>
            <Field label="ステータス" htmlFor="hqStatus">
              <select id="hqStatus" className="select" value={value.status} onChange={(e) => set({ status: e.target.value as HqCampaignInput["status"] })}>
                {HQ_CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{HQ_STATUS_LABELS[s]}</option>)}
              </select>
            </Field>
          </div>
        </div>
        <div className="brand-section">
          <h3>Shared Content Theme</h3>
          <Field label="共通テーマ" htmlFor="hqTheme" error={errors.sharedTheme} hint="全店舗で共通して伝えるメッセージ">
            <textarea id="hqTheme" className={`textarea ${errors.sharedTheme ? "invalid" : ""}`} value={value.sharedTheme} onChange={(e) => set({ sharedTheme: e.target.value })}
              placeholder="例：季節の変わり目の不調を、姿勢から整える。初回姿勢チェック無料" />
          </Field>
        </div>
        <div className="brand-section">
          <h3>Shared Creative</h3>
          <Field label="見出し" htmlFor="hqHeadline">
            <input id="hqHeadline" className="input" value={value.creative.headline} onChange={(e) => set({ creative: { ...value.creative, headline: e.target.value } })} placeholder="その不調、姿勢からかもしれません。" />
          </Field>
          <Field label="本文" htmlFor="hqBody">
            <textarea id="hqBody" className="textarea" value={value.creative.body} onChange={(e) => set({ creative: { ...value.creative, body: e.target.value } })} />
          </Field>
          <Field label="ビジュアル指示" htmlFor="hqVisual" optional>
            <input id="hqVisual" className="input" value={value.creative.visual} onChange={(e) => set({ creative: { ...value.creative, visual: e.target.value } })} placeholder="白背景・自然光、施術シーン" />
          </Field>
        </div>
        <div className="brand-section">
          <h3>Localization Rules</h3>
          <Field label="ローカライズのルール" htmlFor="hqRules" hint="AIが各店舗向けに書き換えるときに必ず守るルール">
            <TagInput id="hqRules" value={value.localizationRules} onChange={(localizationRules) => set({ localizationRules })} suggestions={RULE_SUGGESTIONS} max={15} placeholder="ルールを入力してEnter" />
          </Field>
          <Field label="対象店舗">
            <div className="check-list">
              <label className="check-item">
                <input type="checkbox" checked={allLocations} onChange={() => set({ targetLocationIds: allLocations ? locations.slice(0, 1).map((l) => l.id) : [] })} />
                全店舗
              </label>
              {locations.map((l) => (
                <label className="check-item" key={l.id}>
                  <input type="checkbox" checked={allLocations || value.targetLocationIds.includes(l.id)} disabled={allLocations} onChange={() => toggleLocation(l.id)} />
                  {l.name}{!l.configured && <span className="optional">未カスタマイズ</span>}
                </label>
              ))}
            </div>
          </Field>
        </div>
      </fieldset>

      <div className="panel" style={{ boxShadow: "none" }}>
        <div className="panel-heading">
          <div>
            <div className="panel-title">店舗向けにローカライズ</div>
            <div className="panel-subtitle">各店舗の店舗カスタマイズ・アカウント戦略・ルールを反映した下書きを{targetCount}店舗分つくります（自動投稿はしません）</div>
          </div>
          {!readOnly && (
            <button className="button primary" onClick={localize} disabled={!campaign || localizing || saving} title={!campaign ? "先に保存してください" : undefined}>
              {localizing ? <><Spinner /> 生成中…</> : "✳ 全店舗の下書きを生成"}
            </button>
          )}
        </div>
        {!campaign && <p className="activity-note">キャンペーンを保存すると生成できます。</p>}
        {result && result.skipped.length > 0 && (
          <div className="form-error">{result.skipped.map((s) => `${s.locationName}: ${s.reason}`).join(" / ")}</div>
        )}
        {posts.length > 0 ? (
          <div className="result-list">
            {posts.map((p) => (
              <div className="result-item" key={p.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <b>{p.locationName} · {p.title}</b>
                  <span className={`status-pill ${POST_STATUS_PILL[p.status]}`}>{POST_STATUS_LABELS[p.status]}</span>
                </div>
                <p>{p.caption}</p>
                <p className="hashtag-preview">{p.hashtags.join(" ")}</p>
                <small className="activity-note">{formatSchedule(p.scheduledAt)}</small>
              </div>
            ))}
            <Link className="button small" href="/posts">投稿一覧で確認・予約する →</Link>
          </div>
        ) : (
          campaign && <p className="activity-note">まだローカライズされた下書きはありません。</p>
        )}
      </div>
    </section>
  );
}
