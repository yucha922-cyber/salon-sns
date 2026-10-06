"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ContentPillar, ContentType, PlanItem, PlanProposal } from "@/lib/domain/types";
import { CONTENT_TYPE_LABELS, goalLabel, WEEKDAY_LABELS } from "@/lib/domain/labels";
import { pillarLabel } from "@/lib/brand/content-pillars";
import { approvePlanItemsAction, editPlanItemAction, regeneratePlanItemAction, rejectPlanItemsAction } from "@/app/actions/planning";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/form";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const STATUS_LABEL = { pending: "確認待ち", approved: "承認済み", rejected: "却下" } as const;

export function ProposalReview({
  proposal: initial,
  accountLabel,
  campaignName,
  pillars,
  allowedTypes,
  readOnly,
}: {
  proposal: PlanProposal;
  accountLabel: string;
  campaignName: string | null;
  pillars: ContentPillar[];
  allowedTypes: ContentType[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial.items);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const [pending, startTransition] = useTransition();
  const pendingItems = items.filter((i) => i.status === "pending");
  const approvedCount = items.filter((i) => i.status === "approved").length;

  const replace = (next: PlanItem) => setItems((list) => list.map((i) => (i.id === next.id ? next : i)));

  const approve = (itemIds: string[] | null) =>
    startTransition(async () => {
      const result = await approvePlanItemsAction({ proposalId: initial.id, itemIds });
      if (!result.ok) return toast(result.error, "error");
      setItems(result.data.proposal.items);
      setSelected([]);
      toast(`${result.data.approved}件を承認し、投稿カレンダーに追加しました`);
      router.refresh();
    });

  const reject = (itemIds: string[]) =>
    startTransition(async () => {
      const result = await rejectPlanItemsAction({ proposalId: initial.id, itemIds });
      if (!result.ok) return toast(result.error, "error");
      setItems(result.data.items);
      setSelected([]);
      toast(`${itemIds.length}件を却下しました`);
    });

  const regenerate = (item: PlanItem) => {
    setBusyId(item.id);
    startTransition(async () => {
      const attempt = (attempts[item.id] ?? 0) + 1;
      const result = await regeneratePlanItemAction({ proposalId: initial.id, itemId: item.id, instruction: "", attempt });
      setBusyId(null);
      if (!result.ok) return toast(result.error, "error");
      setAttempts((a) => ({ ...a, [item.id]: attempt }));
      replace(result.data);
      toast("この枠の企画を作り直しました");
    });
  };

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-heading">
          <div>
            <div className="panel-title">{initial.month.replace("-", "年")}月の企画案 · {accountLabel}</div>
            <div className="panel-subtitle">
              目的：{goalLabel(initial.goal)}{campaignName ? ` · 本部テーマ：${campaignName}` : ""} · AI：{initial.aiProvider === "mock" ? "モック" : initial.aiProvider}
            </div>
          </div>
          <span className="priority-tag">{items.length}件中 承認 {approvedCount}件</span>
        </div>
        <div className="recommendation-callout">{initial.summary}</div>
        {!readOnly && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button className="button primary" onClick={() => approve(null)} disabled={pending || !pendingItems.length}>
              {pending && !busyId ? <Spinner /> : "✓"} すべて承認（{pendingItems.length}件）
            </button>
            <button className="button" onClick={() => approve(selected)} disabled={pending || !selected.length}>選択を承認（{selected.length}）</button>
            <button className="button" onClick={() => reject(selected)} disabled={pending || !selected.length}>選択を却下</button>
            <Link className="button" style={{ marginLeft: "auto" }} href="/planner">投稿カレンダーへ →</Link>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="data-table proposal-table">
            <thead>
              <tr>
                <th aria-label="選択" />
                <th>日時</th>
                <th>形式</th>
                <th>企画</th>
                <th>柱 / ファネル</th>
                <th>CTA</th>
                <th>状態</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const d = new Date(`${item.scheduledDate}T00:00:00Z`);
                return (
                  <tr key={item.id} className={item.status} data-testid="plan-item">
                    <td>
                      {item.status === "pending" && !readOnly && (
                        <input type="checkbox" aria-label={`${item.theme}を選択`} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
                      )}
                    </td>
                    <td className="table-muted">{item.scheduledDate.slice(5).replace("-", "/")}（{WEEKDAY_LABELS[d.getUTCDay()]}）<br />{item.scheduledTime}</td>
                    <td className="table-muted">{CONTENT_TYPE_LABELS[item.contentType]}</td>
                    <td className="theme-cell">
                      <b>{busyId === item.id ? "作り直し中…" : item.theme}</b>
                      <small>フック：{item.hook}</small>
                      <small>{item.summary}</small>
                      {item.target && <small>ターゲット：{item.target}</small>}
                    </td>
                    <td><span className="brand-tag">{pillarLabel(item.contentPillar, pillars) || "—"}</span><br /><span className="stage-pill">{item.funnelStage}</span></td>
                    <td className="table-muted" style={{ maxWidth: 160 }}>{item.cta}</td>
                    <td>
                      <span className={`status-pill ${item.status === "pending" ? "review" : item.status === "rejected" ? "draft" : ""}`}>{STATUS_LABEL[item.status]}</span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {item.status === "pending" && !readOnly && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="button small primary" onClick={() => approve([item.id])} disabled={pending} aria-label={`${item.theme}を承認`}>承認</button>
                          <button className="button small" onClick={() => setEditing(item)} disabled={pending}>編集</button>
                          <button className="button small" onClick={() => regenerate(item)} disabled={pending} aria-label={`${item.theme}を再生成`}>↻</button>
                          <button className="button small" onClick={() => reject([item.id])} disabled={pending} aria-label={`${item.theme}を却下`}>却下</button>
                        </div>
                      )}
                      {item.status === "approved" && item.postId && (
                        <Link className="button small soft" href={`/creator?post=${item.postId}`}>キャプション作成 →</Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {editing && (
        <ItemEditor
          key={editing.id}
          item={editing}
          proposalId={initial.id}
          pillars={pillars}
          allowedTypes={allowedTypes}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            replace(next);
            setEditing(null);
            toast("企画を更新しました");
          }}
        />
      )}
    </>
  );
}

function ItemEditor({
  item,
  proposalId,
  pillars,
  allowedTypes,
  onClose,
  onSaved,
}: {
  item: PlanItem;
  proposalId: string;
  pillars: ContentPillar[];
  allowedTypes: ContentType[];
  onClose: () => void;
  onSaved: (item: PlanItem) => void;
}) {
  const [value, setValue] = useState(item);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<PlanItem>) => setValue((v) => ({ ...v, ...patch }));
  const save = () =>
    startTransition(async () => {
      const { id: _id, status: _s, postId: _p, ...fields } = value;
      const result = await editPlanItemAction({ proposalId, itemId: item.id, item: fields });
      if (!result.ok) return setError(result.error);
      onSaved(result.data);
    });
  const goalPillars = pillars.filter((p) => p.goal === item.goal);
  return (
    <Modal open wide title="企画を編集" intro="承認するまでカレンダーには追加されません。" onClose={onClose}
      actions={<><button className="button" onClick={onClose}>キャンセル</button><button className="button primary" onClick={save} disabled={pending}>{pending && <Spinner />} 保存</button></>}>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="two-fields">
        <Field label="日付" htmlFor="itemDate">
          <input id="itemDate" className="input" type="date" value={value.scheduledDate} onChange={(e) => set({ scheduledDate: e.target.value })} />
        </Field>
        <Field label="時間" htmlFor="itemTime">
          <input id="itemTime" className="input" type="time" value={value.scheduledTime} onChange={(e) => set({ scheduledTime: e.target.value })} />
        </Field>
      </div>
      <div className="two-fields">
        <Field label="形式" htmlFor="itemType">
          <select id="itemType" className="select" value={value.contentType} onChange={(e) => set({ contentType: e.target.value as ContentType })}>
            {allowedTypes.map((t) => <option key={t} value={t}>{CONTENT_TYPE_LABELS[t]}</option>)}
          </select>
        </Field>
        <Field label="コンテンツの柱" htmlFor="itemPillar">
          <select id="itemPillar" className="select" value={value.contentPillar} onChange={(e) => set({ contentPillar: e.target.value })}>
            {!goalPillars.some((p) => p.key === value.contentPillar) && <option value={value.contentPillar}>{pillarLabel(value.contentPillar, pillars)}</option>}
            {goalPillars.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="テーマ" htmlFor="itemTheme"><input id="itemTheme" className="input" value={value.theme} onChange={(e) => set({ theme: e.target.value })} /></Field>
      <Field label="フック（冒頭の一言）" htmlFor="itemHook"><input id="itemHook" className="input" value={value.hook} onChange={(e) => set({ hook: e.target.value })} /></Field>
      <Field label="概要" htmlFor="itemSummary"><textarea id="itemSummary" className="textarea" value={value.summary} onChange={(e) => set({ summary: e.target.value })} /></Field>
      <div className="two-fields">
        <Field label="ターゲット" htmlFor="itemTarget"><input id="itemTarget" className="input" value={value.target} onChange={(e) => set({ target: e.target.value })} /></Field>
        <Field label="CTA" htmlFor="itemCta"><input id="itemCta" className="input" value={value.cta} onChange={(e) => set({ cta: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
