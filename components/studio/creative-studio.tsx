"use client";

import { useState, useTransition } from "react";
import { generateCreativeConceptsAction } from "@/app/actions/ai";
import type { CreativeConcepts } from "@/lib/ai/schemas";
import { Field } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { EmptyState, Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const PREVIEW = ["p1", "p2", "p3", "p4"];

export function CreativeStudio({ services, targets, defaultMessage }: { services: string[]; targets: string[]; defaultMessage: string }) {
  const toast = useToast();
  const [objective, setObjective] = useState("新規体験予約");
  const [service, setService] = useState(services[0] ?? "");
  const [target, setTarget] = useState(targets[0] ?? "");
  const [message, setMessage] = useState(defaultMessage);
  const [placement, setPlacement] = useState("Instagram Reel · 縦型動画 9:16");
  const [concepts, setConcepts] = useState<CreativeConcepts["concepts"]>([]);
  const [selected, setSelected] = useState(0);
  const [queueOpen, setQueueOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const generate = () =>
    startTransition(async () => {
      const result = await generateCreativeConceptsAction({ objective, service: service || "メインサービス", target: target || "メインターゲット", message, placement });
      if (!result.ok) return toast(result.error, "error");
      setConcepts(result.data.concepts);
      setSelected(0);
      toast(`Brand Brainに合わせて${result.data.concepts.length}案を提案しました`);
    });

  return (
    <div className="studio-layout">
      <div className="studio-form">
        <div className="panel-title" style={{ marginBottom: 15 }}>広告の条件</div>
        <Field label="広告の目的" htmlFor="objective">
          <select id="objective" className="select" value={objective} onChange={(e) => setObjective(e.target.value)}>
            {["新規体験予約", "認知拡大", "リピート促進"].map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="商品・サービス" htmlFor="service">
          <input id="service" className="input" list="serviceOptions" value={service} onChange={(e) => setService(e.target.value)} />
          <datalist id="serviceOptions">{services.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="ターゲット" htmlFor="studioTarget">
          <input id="studioTarget" className="input" list="studioTargets" value={target} onChange={(e) => setTarget(e.target.value)} />
          <datalist id="studioTargets">{targets.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="悩み・訴求したいこと" htmlFor="message">
          <textarea id="message" className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <Field label="配置・フォーマット" htmlFor="placement">
          <select id="placement" className="select" value={placement} onChange={(e) => setPlacement(e.target.value)}>
            {["Instagram Reel · 縦型動画 9:16", "Instagram Feed · 正方形画像 1:1", "Facebook · 横型画像 1.91:1"].map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <button className="button primary" style={{ width: "100%", justifyContent: "center" }} onClick={generate} disabled={pending}>
          {pending ? <><Spinner /> 提案を作成中…</> : "✳ コンセプトを提案"}
        </button>
      </div>
      <div>
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-heading">
            <div><div className="panel-title">広告コンセプト</div><div className="panel-subtitle">4つの切り口から選んでください</div></div>
            <span className="status-pill">Brand Brain 反映済み</span>
          </div>
          {concepts.length === 0 ? (
            pending ? (
              <div className="concept-grid">{PREVIEW.map((p) => <div key={p} className="concept-card"><div className="skeleton" style={{ height: 140 }} /></div>)}</div>
            ) : (
              <EmptyState icon="✧" title="条件を入力してコンセプトを提案" description="Brand Brainの強み・ターゲット・悩みをもとに、4つの切り口で広告コンセプトを作成します。" />
            )
          ) : (
            <>
              <div className="concept-grid">
                {concepts.map((c, i) => (
                  <article key={c.headline} className={`concept-card ${selected === i ? "selected" : ""}`} onClick={() => setSelected(i)}
                    role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSelected(i)}>
                    <span className="selection-mark" />
                    <div className="concept-label">CONCEPT {String.fromCharCode(65 + i)} · {c.angle}</div>
                    <div className={`concept-preview ${PREVIEW[i % 4]}`}>{c.visualHook}</div>
                    <h3>{c.headline}</h3>
                    <p>{c.body}</p>
                    <div className="concept-footer"><span>{c.rationale}</span></div>
                  </article>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
                <span className="activity-note">選択中：Concept {String.fromCharCode(65 + selected)}</span>
                <button className="button primary" onClick={() => setQueueOpen(true)}>この案でCreativeを生成 →</button>
              </div>
            </>
          )}
        </div>
        <div className="panel">
          <div className="panel-title">制作ステップ</div>
          <div className="campaign-row"><span className="status-pill">1</span><div className="row-main"><b>コンセプトを選ぶ</b><small>訴求軸とメッセージを決定</small></div></div>
          <div className="campaign-row"><span className="status-pill draft">2</span><div className="row-main"><b>Creativeを生成</b><small>画像・動画素材と広告文を作成（生成API連携予定）</small></div></div>
          <div className="campaign-row"><span className="status-pill draft">3</span><div className="row-main"><b>確認して広告に追加</b><small>人間が確認・承認してから配信</small></div></div>
        </div>
      </div>
      <Modal open={queueOpen} title="Creative生成の準備ができました" intro="選択したコンセプトから広告素材を作成します。" onClose={() => setQueueOpen(false)}
        actions={<><button className="button" onClick={() => setQueueOpen(false)}>閉じる</button><button className="button primary" onClick={() => { setQueueOpen(false); toast("画像・動画生成は今後のアップデートで対応します"); }}>生成キューに追加</button></>}>
        <div className="recommendation-callout">
          <b>{concepts[selected]?.headline}</b><br />
          次の工程では画像・動画生成APIを接続し、広告素材と本文を制作します。
        </div>
      </Modal>
    </div>
  );
}
