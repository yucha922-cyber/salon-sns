"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ContentType, PostStatus, SocialPlatform } from "@/lib/domain/types";
import { CONTENT_TYPE_LABELS, PLATFORM_LABELS } from "@/lib/domain/labels";
import { generatePostAction } from "@/app/actions/ai";
import { savePostAction } from "@/app/actions/posts";
import { ChoiceChips, Field } from "@/components/ui/form";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const FORMATS: Record<SocialPlatform, ContentType[]> = {
  instagram: ["feed", "carousel", "reel", "story"],
  threads: ["text"],
  tiktok: ["short_video"],
  facebook: ["feed", "text"],
};

interface Draft {
  title: string;
  caption: string;
  cta: string;
  hashtags: string;
}

export interface CreatorDefaults {
  brandHandle: string;
  locationLabel: string;
  targets: string[];
  tones: string[];
  initialTheme: string;
  initialDate: string;
}

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PostCreator({ defaults }: { defaults: CreatorDefaults }) {
  const router = useRouter();
  const toast = useToast();
  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [contentType, setContentType] = useState<ContentType>("carousel");
  const [theme, setTheme] = useState(defaults.initialTheme);
  const [target, setTarget] = useState(defaults.targets[0] ?? "");
  const [goal, setGoal] = useState("保存・シェア");
  const [tone, setTone] = useState(defaults.tones[0] ?? "やさしく専門的");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState(() => {
    if (defaults.initialDate) return `${defaults.initialDate}T20:00`;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(20, 0, 0, 0);
    return toLocalInput(d);
  });
  const [status, setStatus] = useState<PostStatus>("scheduled");
  const [error, setError] = useState<string | null>(null);
  const [generating, startGenerate] = useTransition();
  const [saving, startSave] = useTransition();

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
      const result = await generatePostAction({ platform, contentType, theme, target, goal, tone, notes });
      if (!result.ok) {
        setError(result.error);
        toast(result.error, "error");
        return;
      }
      const d = result.data.draft;
      setDraft({ title: d.title, caption: d.caption, cta: d.cta, hashtags: d.hashtags.join(" ") });
      setProvider(result.data.provider);
      toast("Brand Brainを反映した投稿を生成しました");
    });
  };

  const save = () => {
    if (!draft) return;
    startSave(async () => {
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

  return (
    <section className="creator-layout">
      <div className="form-panel">
        <div className="panel-title" style={{ marginBottom: 17 }}>投稿の内容を設定</div>
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
            <div className="social-brand-avatar">{defaults.brandHandle.replace("@", "").slice(0, 1).toUpperCase() || "N"}</div>
            <div className="social-user">
              {defaults.brandHandle.replace("@", "") || "your_brand"}
              <small>{defaults.locationLabel} · {PLATFORM_LABELS[platform]}</small>
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
                <b>{defaults.brandHandle.replace("@", "") || "your_brand"}</b>{" "}
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
              {saving ? <><Spinner /> 保存中…</> : "SNS Plannerへ追加 →"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
