"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createExperimentAction, generateCreativeDraftsAction, rejectHypothesisAction, reviewCreativeAction } from "@/app/actions/ads";
import { ANGLE_LABELS, VARIABLE_LABELS } from "@/lib/ads/creative-memory";
import { checkAdCopy } from "@/lib/ads/policy";
import type { AdCreativeRecord, CreativeAngle, CreativeBrief, TestVariable } from "@/lib/ads/types";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

export interface LabContext {
  hypothesisId: string;
  status: string;
  goal: "acquisition" | "recruitment";
  brandName: string;
  locationName: string;
  campaignName: string;
  adSetName: string;
  persona: string;
  painPoint: string;
  problem: string;
  hypothesis: string;
  variable: TestVariable;
  testIdea: string;
  expectedResult: string;
  primaryMetricLabel: string;
  landingPageUrl: string | null;
  control: { hook: string; headline: string; primaryText: string; cta: string; angle: string; format: string | null } | null;
  performance: { label: string; value: string }[];
  memory: string[];
  existingExperiment: { id: string; status: string } | null;
}

type Draft = Pick<AdCreativeRecord, "id" | "status" | "hook" | "headline" | "primaryText" | "cta" | "firstViewCopy" | "visualDirection" | "angle" | "videoScript" | "rejectedReason" | "aiProvider"> & { brief: CreativeBrief | null };

const CTA_OPTIONS = ["BOOK_NOW", "LEARN_MORE", "APPLY_NOW", "SIGN_UP", "CONTACT_US"] as const;
const STATUS: Record<string, [string, string]> = { in_review: ["レビュー待ち", "review"], approved: ["承認済み", "approved"], rejected: ["却下", "failed"], published: ["テストで使用中", ""], draft: ["下書き", "draft"] };

export function CreativeLab({ ctx, drafts, readOnly }: { ctx: LabContext; drafts: Draft[]; readOnly: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [form, setForm] = useState({ headline: "", primaryText: "", hook: "", firstViewCopy: "", visualDirection: "", cta: "BOOK_NOW" as (typeof CTA_OPTIONS)[number] });
  const [rejecting, setRejecting] = useState<Draft | null>(null);
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const brief = drafts.find((d) => d.brief)?.brief ?? null;
  const approved = drafts.filter((d) => d.status === "approved");
  const closed = ctx.status === "rejected" || ctx.status === "validated" || ctx.status === "invalidated";
  const lpHypothesis = ctx.variable === "landing_page";

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, after?: () => void) =>
    start(async () => {
      const r = (await fn()) as { ok: true } | { ok: false; error: string };
      if (!r.ok) return toast(r.error, "error");
      toast(done);
      after?.();
      router.refresh();
    });

  const openEdit = (d: Draft) => {
    setEditing(d);
    setForm({ headline: d.headline, primaryText: d.primaryText, hook: d.hook, firstViewCopy: d.firstViewCopy, visualDirection: d.visualDirection, cta: (CTA_OPTIONS as readonly string[]).includes(d.cta) ? (d.cta as (typeof CTA_OPTIONS)[number]) : "LEARN_MORE" });
  };

  return (
    <div className="studio-layout" style={{ gridTemplateColumns: "340px minmax(0,1fr)" }}>
      <aside className="studio-form" data-testid="hypothesis-context">
        <div className="concept-label">AIの仮説から作成（入力不要）</div>
        <h3 style={{ fontSize: 13, margin: "8px 0" }}>{ctx.hypothesis}</h3>
        <div className="context-line"><span>ブランド</span><b>{ctx.brandName}</b></div>
        <div className="context-line"><span>店舗</span><b>{ctx.locationName}</b></div>
        <div className="context-line"><span>目的</span><b>{ctx.goal === "recruitment" ? "採用（応募）" : "集客（予約）"}</b></div>
        <div className="context-line"><span>キャンペーン</span><b>{ctx.campaignName}</b></div>
        <div className="context-line"><span>ペルソナ</span><b style={{ textAlign: "right" }}>{ctx.persona || "—"}</b></div>
        <div className="context-line"><span>悩み</span><b>{ctx.painPoint || "—"}</b></div>
        <div className="context-label">課題</div>
        <p style={{ fontSize: 10, lineHeight: 1.7, margin: 0 }}>{ctx.problem}</p>
        <div className="context-label">テスト設計</div>
        <div className="context-line"><span>変える変数（1つだけ）</span><b>{VARIABLE_LABELS[ctx.variable]}</b></div>
        <div className="context-line"><span>主KPI</span><b>{ctx.primaryMetricLabel}</b></div>
        <p className="field-hint" style={{ marginTop: 6 }}>{ctx.testIdea}</p>
        <div className="context-label">現行Creative（Control A）</div>
        {ctx.control ? (
          <div className="review-box">
            <b>{ctx.control.hook || ctx.control.headline}</b>
            <div style={{ fontSize: 9 }}>{ctx.control.primaryText}</div>
            <div className="table-muted" style={{ fontSize: 9 }}>{ANGLE_LABELS[ctx.control.angle as CreativeAngle] ?? ctx.control.angle} · {ctx.control.format ?? ""} · CTA {ctx.control.cta}</div>
          </div>
        ) : (
          <p className="activity-note">現行Creativeの情報がありません</p>
        )}
        {ctx.performance.length > 0 && (
          <>
            <div className="context-label">現行の実績（直近14日）</div>
            {ctx.performance.map((p) => (
              <div className="context-line" key={p.label}><span>{p.label}</span><b>{p.value}</b></div>
            ))}
          </>
        )}
        {ctx.memory.length > 0 && (
          <>
            <div className="context-label">Creative Memory（勝ちパターン）</div>
            {ctx.memory.map((m) => (
              <p key={m} className="field-hint" style={{ margin: "0 0 4px" }}>❖ {m}</p>
            ))}
          </>
        )}
        {!readOnly && !closed && ctx.status === "proposed" && (
          <button className="button small section-spacer" disabled={pending} onClick={() => act(() => rejectHypothesisAction(ctx.hypothesisId), "仮説を見送りました")}>
            この仮説は見送る
          </button>
        )}
      </aside>

      <section>
        {lpHypothesis ? (
          <div className="panel">
            <div className="panel-title">この課題はCreativeではなくLPが原因の可能性が高いです</div>
            <p className="field-hint" style={{ marginTop: 8 }}>CTRは保てているのにLP到達後のCVRが落ちています。Creativeを変えても改善しにくいため、LPのファーストビュー・予約導線・表示速度・在庫（予約枠）を確認してください。</p>
            {ctx.landingPageUrl && (
              <a className="button primary" href={ctx.landingPageUrl} target="_blank" rel="noreferrer noopener">
                LPを開いて確認 ↗
              </a>
            )}
          </div>
        ) : (
          <>
            <div className="panel" style={{ marginBottom: 14 }}>
              <div className="panel-heading">
                <div>
                  <div className="panel-title">Creative Brief</div>
                  <div className="panel-subtitle">B / C は「{VARIABLE_LABELS[ctx.variable]}」だけを変えた案です。AIの案はレビューで承認されるまでどこにも公開されません。</div>
                </div>
                {!readOnly && !closed && (
                  <button className={`button ${drafts.length ? "" : "primary"}`} disabled={pending} onClick={() => act(() => generateCreativeDraftsAction(ctx.hypothesisId, drafts.length > 0), drafts.length ? "Creative案を再生成しました" : "Creative案を作成しました")} data-testid="generate-drafts">
                    {pending ? <Spinner /> : "✧"} {drafts.length ? "再生成" : "Creative案を作る"}
                  </button>
                )}
              </div>
              {brief ? (
                <div className="brand-value-grid" data-testid="creative-brief">
                  {[
                    ["Goal", brief.goal],
                    ["Persona", brief.persona],
                    ["Pain", brief.painPoint],
                    ["Core Message", brief.coreMessage],
                    ["Hook", brief.hook],
                    ["Angle", ANGLE_LABELS[brief.angle] ?? brief.angle],
                    ["Proof", brief.proof],
                    ["CTA", brief.cta],
                    ["Visual Direction", brief.visualDirection],
                    ["Scene Structure", brief.sceneStructure.join(" → ")],
                    ["Required Assets", brief.requiredAssets.join("、")],
                    ["Brand Tone", brief.brandTone],
                  ].map(([k, v]) => (
                    <div className="brand-value" key={k}>
                      <span>{k}</span>
                      <b>{v}</b>
                    </div>
                  ))}
                  <div className="brand-value" style={{ gridColumn: "1 / -1" }}>
                    <span>Forbidden Expressions / Meta Policy</span>
                    <b>{[...brief.forbiddenExpressions, ...brief.policyNotes].join(" ・ ")}</b>
                  </div>
                </div>
              ) : (
                <div className="insufficient">「Creative案を作る」を押すと、Brand Brain・現行Creative・実績・Creative Memoryから Brief と B / C 案を作成します。</div>
              )}
            </div>

            {drafts.length > 0 && (
              <div className="concept-grid" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
                {ctx.control && (
                  <article className="concept-card" style={{ cursor: "default" }}>
                    <div className="concept-label">A · CONTROL（現行）</div>
                    <h3>{ctx.control.hook || ctx.control.headline}</h3>
                    <p>{ctx.control.primaryText}</p>
                    <div className="concept-footer"><span>{ANGLE_LABELS[ctx.control.angle as CreativeAngle] ?? ""}</span><span>{ctx.control.cta}</span></div>
                  </article>
                )}
                {drafts.map((d, i) => {
                  const warnings = checkAdCopy({ headline: d.headline, primaryText: d.primaryText, hook: d.hook, firstViewCopy: d.firstViewCopy, variable: ctx.variable });
                  const [label, cls] = STATUS[d.status] ?? [d.status, "draft"];
                  const pickable = d.status === "approved";
                  return (
                    <article key={d.id} className={`concept-card ${selected.includes(d.id) ? "selected" : ""}`} style={{ cursor: "default" }} data-testid="draft-card">
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div className="concept-label">{String.fromCharCode(66 + i)} · {ANGLE_LABELS[d.angle as CreativeAngle] ?? d.angle}</div>
                        <span className={`status-pill ${cls}`}>{label}</span>
                      </div>
                      <h3>{d.hook}</h3>
                      <div className="concept-preview p2">{d.firstViewCopy}</div>
                      <p><b>見出し：</b>{d.headline}</p>
                      <p style={{ marginTop: 4 }}>{d.primaryText}</p>
                      <p style={{ marginTop: 4 }}><b>Visual：</b>{d.visualDirection}</p>
                      {d.videoScript && (
                        <details style={{ fontSize: 9, marginTop: 4 }}>
                          <summary>動画の構成（{d.videoScript.scenes.length}シーン）</summary>
                          <ol style={{ paddingLeft: 16, margin: "4px 0" }}>
                            {d.videoScript.scenes.map((s) => (
                              <li key={s.seconds}>{s.seconds}秒：{s.onScreenText}（{s.visual}）</li>
                            ))}
                          </ol>
                        </details>
                      )}
                      {warnings.length > 0 && (
                        <ul className="issue-list" style={{ marginTop: 6 }}>
                          {warnings.map((w) => (
                            <li key={w.code + w.message} className={`issue ${w.level === "warn" ? "warning" : ""}`}>
                              <small>{w.level === "warn" ? "⚠ " : "ℹ "}{w.message}</small>
                            </li>
                          ))}
                        </ul>
                      )}
                      {d.rejectedReason && <p className="field-hint">却下理由: {d.rejectedReason}</p>}
                      {!readOnly && (d.status === "in_review" || d.status === "approved" || d.status === "draft") && (
                        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                          {d.status !== "approved" && (
                            <button className="button small primary" disabled={pending} onClick={() => act(() => reviewCreativeAction(d.id, { action: "approve" }), "承認しました")} data-testid="approve-draft">
                              ✓ Approve
                            </button>
                          )}
                          <button className="button small" disabled={pending} onClick={() => openEdit(d)}>編集</button>
                          <button className="button small" disabled={pending} onClick={() => setRejecting(d)}>却下</button>
                          {pickable && (
                            <label style={{ fontSize: 9, display: "flex", alignItems: "center", gap: 4 }}>
                              <input type="checkbox" checked={selected.includes(d.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, d.id].slice(-2) : s.filter((x) => x !== d.id)))} data-testid="pick-draft" /> テストに使う
                            </label>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            {ctx.existingExperiment ? (
              <div className="recommendation-callout section-spacer">
                この仮説のA/Bテストがあります。<Link href={`/ads/experiments/${ctx.existingExperiment.id}`}>テストを開く →</Link>
              </div>
            ) : (
              approved.length > 0 &&
              !readOnly && (
                <div className="panel section-spacer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div className="panel-title">A/Bテストを作成</div>
                    <div className="panel-subtitle">Control（A）＋ 承認済みの案（最大2つ）。作成後もテストプランの承認と最終確認が終わるまでMetaには送信されません。</div>
                  </div>
                  <button className="button primary" disabled={pending || !selected.length} onClick={() => start(async () => {
                    const r = await createExperimentAction(ctx.hypothesisId, selected);
                    if (!r.ok) return toast(r.error, "error");
                    toast("A/Bテスト案を作成しました");
                    router.push(`/ads/experiments/${r.data.experimentId}`);
                  })} data-testid="create-experiment">
                    テスト案を作成（{selected.length}案）
                  </button>
                </div>
              )
            )}
          </>
        )}
      </section>

      <Modal
        open={editing !== null}
        title="Creativeを編集"
        intro="編集すると再承認が必要になります。変える変数以外（オファー・CTA等）はControlと揃えるのが原則です。"
        onClose={() => setEditing(null)}
        wide
        actions={
          <>
            <button className="button" onClick={() => setEditing(null)}>キャンセル</button>
            <button className="button primary" disabled={pending} onClick={() => editing && act(() => reviewCreativeAction(editing.id, { action: "edit", patch: form }), "保存しました（再承認待ち）", () => setEditing(null))}>
              保存
            </button>
          </>
        }
      >
        {(["hook", "headline", "firstViewCopy"] as const).map((k) => (
          <div className="field" key={k}>
            <label>{k === "hook" ? "Hook" : k === "headline" ? "見出し" : "First View Copy"}</label>
            <input className="input" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </div>
        ))}
        <div className="field">
          <label>本文</label>
          <textarea className="textarea" value={form.primaryText} onChange={(e) => setForm({ ...form, primaryText: e.target.value })} />
        </div>
        <div className="field">
          <label>Visual Direction</label>
          <textarea className="textarea" value={form.visualDirection} onChange={(e) => setForm({ ...form, visualDirection: e.target.value })} />
        </div>
        <div className="field">
          <label>CTA</label>
          <select className="select" value={form.cta} onChange={(e) => setForm({ ...form, cta: e.target.value as (typeof CTA_OPTIONS)[number] })}>
            {CTA_OPTIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <ul className="issue-list">
          {checkAdCopy({ ...form, variable: ctx.variable }).map((w) => (
            <li key={w.code + w.message} className={`issue ${w.level === "warn" ? "warning" : ""}`}><small>{w.message}</small></li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={rejecting !== null}
        title="Creativeを却下"
        onClose={() => setRejecting(null)}
        actions={
          <>
            <button className="button" onClick={() => setRejecting(null)}>キャンセル</button>
            <button className="button primary" disabled={pending} onClick={() => rejecting && act(() => reviewCreativeAction(rejecting.id, { action: "reject", reason }), "却下しました", () => { setRejecting(null); setReason(""); })}>
              却下する
            </button>
          </>
        }
      >
        <div className="field">
          <label>理由（次の生成の参考にします）</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </div>
      </Modal>
    </div>
  );
}
