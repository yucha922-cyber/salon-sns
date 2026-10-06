"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ContentType, PostStatus, SocialPlatform } from "@/lib/domain/types";
import { CONTENT_TYPE_LABELS, PLATFORM_LABELS } from "@/lib/domain/labels";
import { generatePostAction } from "@/app/actions/ai";
import { savePostAction, updatePostAction } from "@/app/actions/posts";
import { ChoiceChips, Field } from "@/components/ui/form";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const FORMATS: Record<SocialPlatform, ContentType[]> = {
  instagram: ["feed", "carousel", "reel", "story", "before_after", "staff", "educational", "testimonial", "offer"],
  threads: ["threads_text", "text"],
  tiktok: ["short_video", "staff", "educational"],
  facebook: ["feed", "text", "educational", "testimonial", "offer"],
};

interface Draft {
  title: string;
  hook: string;
  caption: string;
  cta: string;
  hashtags: string;
}

export interface CreatorAccountOption {
  id: string;
  label: string;
  handle: string;
  platform: SocialPlatform;
  locationId: string | null;
  tone: string;
  persona: string;
}

export interface CreatorDefaults {
  brandHandle: string;
  locationLabel: string;
  targets: string[];
  tones: string[];
  initialTheme: string;
  initialDate: string;
  /** YYYY-MM-DD (JST), computed on the server */
  tomorrowDate: string;
  accounts: CreatorAccountOption[];
  locations: { id: string; name: string }[];
  campaigns: { id: string; name: string; theme: string }[];
  initialAccountId: string;
  initialCampaignId: string;
  /** Approved plan item → caption step: saving updates this planner post. */
  planned?: {
    postId: string;
    platform: SocialPlatform;
    contentType: ContentType;
    theme: string;
    notes: string;
    target: string;
    scheduledAtLocal: string;
  } | null;
}


export function PostCreator({ defaults }: { defaults: CreatorDefaults }) {
  const router = useRouter();
  const toast = useToast();
  const initialAccount = defaults.accounts.find((a) => a.id === defaults.initialAccountId) ?? null;
  const initialCampaign = defaults.campaigns.find((c) => c.id === defaults.initialCampaignId) ?? null;
  const [accountId, setAccountId] = useState(initialAccount?.id ?? "");
  const [locationId, setLocationId] = useState(initialAccount?.locationId ?? "");
  const [campaignId, setCampaignId] = useState(initialCampaign?.id ?? "");
  const planned = defaults.planned ?? null;
  const [platform, setPlatform] = useState<SocialPlatform>(planned?.platform ?? initialAccount?.platform ?? "instagram");
  const [contentType, setContentType] = useState<ContentType>(
    planned?.contentType ??
      (initialAccount && !FORMATS[initialAccount.platform].includes("carousel") ? (FORMATS[initialAccount.platform][0] ?? "feed") : "carousel"),
  );
  const [theme, setTheme] = useState(planned?.theme ?? initialCampaign?.theme ?? defaults.initialTheme);
  const [target, setTarget] = useState(planned?.target || initialAccount?.persona || (defaults.targets[0] ?? ""));
  const [goal, setGoal] = useState("保存・シェア");
  const [tone, setTone] = useState(initialAccount?.tone || (defaults.tones[0] ?? "やさしく専門的"));
  const [notes, setNotes] = useState(planned?.notes ?? "");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState(() => {
    if (planned?.scheduledAtLocal) return planned.scheduledAtLocal;
    // Default comes from the server (Japan time) so SSR and hydration match.
    return `${defaults.initialDate || defaults.tomorrowDate}T20:00`;
  });
  const [status, setStatus] = useState<PostStatus>("scheduled");
  const [error, setError] = useState<string | null>(null);
  const [generating, startGenerate] = useTransition();
  const [saving, startSave] = useTransition();

  const account = defaults.accounts.find((a) => a.id === accountId) ?? null;

  const changeAccount = (id: string) => {
    setAccountId(id);
    const next = defaults.accounts.find((a) => a.id === id);
    if (!next) return;
    changePlatform(next.platform);
    setLocationId(next.locationId ?? "");
    if (next.tone) setTone(next.tone);
    if (next.persona) setTarget(next.persona.slice(0, 200));
  };

  const changeCampaign = (id: string) => {
    setCampaignId(id);
    const c = defaults.campaigns.find((x) => x.id === id);
    if (c) setTheme(c.theme);
  };

  const scope = { accountId: accountId || null, locationId: locationId || null, hqCampaignId: campaignId || null };

  const changePlatform = (p: SocialPlatform) => {
    setPlatform(p);
    const allowed = FORMATS[p];
    if (!allowed.includes(contentType)) setContentType(allowed[0] ?? "feed");
  };

  const generate = () => {
    if (!theme.trim()) {
      setError("投稿テーマを入力してください");
      return;
    }
    setError(null);
    startGenerate(async () => {
      const result = await generatePostAction({ platform, contentType, theme, target, goal, tone, notes }, scope);
      if (!result.ok) {
        setError(result.error);
        toast(result.error, "error");
        return;
      }
      const d = result.data.draft;
      setDraft({ title: d.title, hook: d.hook, caption: d.caption, cta: d.cta, hashtags: d.hashtags.join(" ") });
      setProvider(result.data.provider);
      toast("Brand Brainを反映した投稿を生成しました");
    });
  };

  const save = () => {
    if (!draft) return;
    startSave(async () => {
      if (planned) {
        const updated = await updatePostAction({
          id: planned.postId,
          title: draft.title,
          caption: draft.caption,
          cta: draft.cta,
          hashtags: draft.hashtags.split(/[\s,、]+/).filter(Boolean).map((h) => (h.startsWith("#") ? h : `#${h}`)),
          status,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        });
        if (!updated.ok) {
          setError(updated.error);
          return toast(updated.error, "error");
        }
        toast(status === "scheduled" ? "キャプションを保存し、予約しました" : "キャプションを保存しました");
        const at = updated.data.scheduledAt ? new Date(updated.data.scheduledAt) : new Date();
        router.push(`/planner?month=${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}&highlight=${updated.data.id}`);
        router.refresh();
        return;
      }
      const result = await savePostAction({
        platform,
        contentType,
        title: draft.title,
        caption: draft.caption,
        cta: draft.cta,
        hashtags: draft.hashtags.split(/[\s,、]+/).filter(Boolean),
        status,
        scheduledAt: status === "scheduled" || scheduledAt ? new Date(scheduledAt).toISOString() : null,
        generationInput: { theme, target, goal, tone, notes },
        hook: draft.hook,
        ...scope,
      });
      if (!result.ok) {
        setError(result.error);
        toast(result.error, "error");
        return;
      }
      toast(status === "scheduled" ? "SNS Plannerに予約しました" : "下書きとしてSNS Plannerに追加しました");
      const when = result.data.scheduledAt ? new Date(result.data.scheduledAt) : new Date();
      router.push(`/planner?month=${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}&highlight=${result.data.id}`);
      router.refresh();
    });
  };

  const hashtags = draft?.hashtags.split(/[\s,、]+/).filter(Boolean) ?? [];
  const handle = (account?.handle || defaults.brandHandle).replace("@", "");
  const locationLabel = defaults.locations.find((l) => l.id === locationId)?.name ?? defaults.locationLabel;

  return (
    <section className="creator-layout">
      <div className="form-panel">
        <div className="panel-title" style={{ marginBottom: 17 }}>投稿の内容を設定</div>
        {(defaults.accounts.length > 0 || defaults.campaigns.length > 0) && (
          <div className="two-fields">
            <Field label="投稿するアカウント" htmlFor="creatorAccount" hint="アカウント戦略（目的・柱・CTA・トーン）を反映">
              <select id="creatorAccount" className="select" value={accountId} onChange={(e) => changeAccount(e.target.value)}>
                <option value="">指定しない（Brand Brainのみ）</option>
                {defaults.accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </Field>
            <Field label="本部キャンペーン" htmlFor="creatorCampaign" optional hint="共通テーマをこの店舗向けにローカライズ">
              <select id="creatorCampaign" className="select" value={campaignId} onChange={(e) => changeCampaign(e.target.value)}>
                <option value="">使わない</option>
                {defaults.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
        )}
        {defaults.locations.length > 1 && !account?.locationId && (
          <Field label="店舗" htmlFor="creatorLocation" optional hint="店舗カスタマイズ（エリア・スタッフ・オファー）を反映">
            <select id="creatorLocation" className="select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">指定しない</option>
              {defaults.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="SNSプラットフォーム">
          <ChoiceChips value={platform} onChange={changePlatform}
            options={(Object.keys(FORMATS) as SocialPlatform[]).map((p) => ({ value: p, label: PLATFORM_LABELS[p] }))} />
        </Field>
        <Field label="投稿形式">
          <ChoiceChips value={contentType} onChange={setContentType}
            options={FORMATS[platform].map((c) => ({ value: c, label: CONTENT_TYPE_LABELS[c] }))} />
        </Field>
        <Field label="投稿テーマ" htmlFor="postTopic" error={error && !theme.trim() ? error : undefined}>
          <textarea id="postTopic" className="textarea" value={theme} onChange={(e) => setTheme(e.target.value)}
            placeholder="例：肩こりを軽くするデスクワーク中の習慣" />
        </Field>
        <div className="two-fields">
          <Field label="投稿の目的" htmlFor="goal">
            <select id="goal" className="select" value={goal} onChange={(e) => setGoal(e.target.value)}>
              {["保存・シェア", "認知を広げる", "来店・予約", "信頼を高める"].map((g) => <option key={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="ターゲット" htmlFor="target">
            <input id="target" className="input" list="targetOptions" value={target} onChange={(e) => setTarget(e.target.value)} />
            <datalist id="targetOptions">{defaults.targets.map((t) => <option key={t} value={t} />)}</datalist>
          </Field>
        </div>
        <Field label="文章トーン" htmlFor="tone">
          <input id="tone" className="input" list="toneOptions" value={tone} onChange={(e) => setTone(e.target.value)} />
          <datalist id="toneOptions">{defaults.tones.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label="含めたい情報" optional htmlFor="notes">
          <input id="notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="キャンペーン、予約URLなど" />
        </Field>
        {error && theme.trim() && <div className="form-error" role="alert">{error}</div>}
        <button className="button primary" style={{ width: "100%", justifyContent: "center" }} onClick={generate} disabled={generating}>
          {generating ? <><Spinner /> 生成中…</> : draft ? "↻ もう一度生成" : "✳ AIで投稿を生成"}
        </button>
        <div className="field-hint" style={{ margin: "10px 0 0", textAlign: "center" }}>
          Brand Brainの店舗情報・ターゲット・表現ルールを自動で反映します
        </div>
      </div>

      <div className="preview-panel">
        <div className="preview-top">
          <b>{draft ? "生成結果を編集" : "投稿プレビュー"}</b>
          <span className="status-pill draft">{draft ? `AI生成${provider === "mock" ? "（モック）" : ""}` : "未生成"}</span>
        </div>
        <div className="social-preview">
          <div className="social-header">
            <div className="social-brand-avatar">{handle.slice(0, 1).toUpperCase() || "N"}</div>
            <div className="social-user">
              {handle || "your_brand"}
              <small>{locationLabel} · {PLATFORM_LABELS[platform]}</small>
            </div>
          </div>
          {platform !== "threads" && (
            <div className="post-art">
              <div className="art-copy">
                <span>{CONTENT_TYPE_LABELS[contentType].toUpperCase()}</span>
                <b id="previewTitle">{draft?.title || theme || "投稿テーマを入力"}</b>
              </div>
            </div>
          )}
          <div className="social-actions">♡　♧　➤ <span style={{ marginLeft: "auto" }}>♧</span></div>
          <div className="social-caption">
            {generating ? (
              <div aria-busy><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line" style={{ width: "70%" }} /></div>
            ) : draft ? (
              <>
                <b>{handle || "your_brand"}</b>{" "}
                {draft.hook && <><b style={{ fontWeight: 600 }}>{draft.hook}</b><br /></>}
                <span style={{ whiteSpace: "pre-wrap" }}>{draft.caption}</span>
                {draft.cta && <><br /><br />{draft.cta}</>}
                <br /><br />
                <span className="hashtag">{hashtags.join(" ")}</span>
              </>
            ) : (
              <span className="muted">左のフォームでテーマを入力し「AIで投稿を生成」を押すと、ここに投稿案が表示されます。</span>
            )}
          </div>
        </div>

        {draft && (
          <div className="form-panel result-editor" style={{ marginTop: 14 }}>
            <Field label="タイトル" htmlFor="draftTitle">
              <input id="draftTitle" className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <Field label="フック（冒頭の一言）" htmlFor="draftHook">
              <input id="draftHook" className="input" value={draft.hook} onChange={(e) => setDraft({ ...draft, hook: e.target.value })} />
            </Field>
            <Field label="キャプション" htmlFor="draftCaption">
              <textarea id="draftCaption" className="textarea" style={{ minHeight: 130 }} value={draft.caption}
                onChange={(e) => setDraft({ ...draft, caption: e.target.value })} />
            </Field>
            <Field label="CTA" htmlFor="draftCta">
              <input id="draftCta" className="input" value={draft.cta} onChange={(e) => setDraft({ ...draft, cta: e.target.value })} />
            </Field>
            <Field label="ハッシュタグ" hint="スペース区切り" htmlFor="draftTags">
              <input id="draftTags" className="input" value={draft.hashtags} onChange={(e) => setDraft({ ...draft, hashtags: e.target.value })} />
            </Field>
            <div className="two-fields">
              <Field label="ステータス" htmlFor="draftStatus">
                <select id="draftStatus" className="select" value={status} onChange={(e) => setStatus(e.target.value as PostStatus)}>
                  <option value="scheduled">予約する</option>
                  <option value="draft">下書きで保存</option>
                </select>
              </Field>
              <Field label="投稿日時" htmlFor="draftDate" optional={status === "draft"}>
                <input id="draftDate" className="input" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </Field>
            </div>
            <div className="field-hint">SNSへの自動投稿はまだ行いません。予約した投稿はカレンダーで管理できます。</div>
            <button className="button primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} onClick={save}
              disabled={saving || !draft.title.trim() || (status === "scheduled" && !scheduledAt)}>
              {saving ? <><Spinner /> 保存中…</> : planned ? "キャプションを保存 →" : "SNS Plannerへ追加 →"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
