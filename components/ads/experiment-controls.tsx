"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { experimentCommandAction } from "@/app/actions/ads";
import type { ExperimentCommand } from "@/lib/ads/app";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

interface Props {
  experimentId: string;
  status: string;
  launched: boolean;
  canEdit: boolean;
  canOperate: boolean;
  adSetName: string;
  challengerCount: number;
  decision: string | null;
  winnerLabel: string | null;
  reasons: string[];
  missing: string[];
  isMock: boolean;
}

export function ExperimentControls(p: Props) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<null | "launch" | "activate" | "complete" | "cancel">(null);
  const [startNow, setStartNow] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [pauseLosers, setPauseLosers] = useState(false);

  const exec = (command: ExperimentCommand, done: string) =>
    start(async () => {
      const metaChanging = command.startsWith("launch") || command === "activate" || command === "complete_pause_losers";
      const r = await experimentCommandAction(p.experimentId, command, metaChanging ? "Metaへ反映" : undefined);
      if (!r.ok) return toast(r.error, "error");
      toast(done);
      setDialog(null);
      setConfirmed(false);
      router.refresh();
    });

  const operatorNote = !p.canOperate && <p className="field-hint">Metaへの反映は管理者（owner / admin）または店舗マネージャーが行います。</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {p.status === "draft" && (
          <button className="button primary" disabled={!p.canEdit || pending} onClick={() => exec("approve", "テストプランを承認しました")}>
            ✓ テストプランを承認
          </button>
        )}
        {p.status === "approved" && !p.launched && (
          <button className="button primary" disabled={!p.canOperate || pending} onClick={() => setDialog("launch")} data-testid="open-launch">
            Metaへ反映（最終確認）
          </button>
        )}
        {p.status === "approved" && p.launched && (
          <button className="button primary" disabled={!p.canOperate || pending} onClick={() => setDialog("activate")}>
            ▶ 配信を開始
          </button>
        )}
        {p.status === "running" && (
          <>
            <button className="button" disabled={!p.canEdit || pending} onClick={() => exec("refresh", "最新データで再評価しました")}>
              {pending ? <Spinner /> : "↻"} 再評価
            </button>
            <button className="button primary" disabled={!p.canEdit || pending} onClick={() => setDialog("complete")} data-testid="open-complete">
              結果を確定してテストを完了
            </button>
          </>
        )}
        {(p.status === "draft" || p.status === "approved" || p.status === "running") && (
          <button className="button" disabled={!(p.launched ? p.canOperate : p.canEdit) || pending} onClick={() => setDialog("cancel")}>
            中止
          </button>
        )}
      </div>
      {(p.status === "approved" || (p.status === "draft" && p.canEdit)) && operatorNote}

      <Modal
        open={dialog === "launch"}
        title="Metaへ反映する前の最終確認"
        intro="AIは提案のみです。この操作はあなたの承認として記録されます。"
        onClose={() => setDialog(null)}
        actions={
          <>
            <button className="button" onClick={() => setDialog(null)}>
              キャンセル
            </button>
            <button className="button primary" disabled={!confirmed || pending} onClick={() => exec(startNow ? "launch_start" : "launch_paused", startNow ? "テストを開始しました" : "停止状態で広告を作成しました")} data-testid="confirm-launch">
              {pending ? <Spinner /> : null} Metaへ反映
            </button>
          </>
        }
      >
        <ul className="summary-list" style={{ fontSize: 10, lineHeight: 1.8, paddingLeft: 16 }}>
          <li>
            既存の広告セット「{p.adSetName}」に、承認済みのChallenger広告を<b>{p.challengerCount}件</b>作成します（Control＝現行広告はそのまま）。
          </li>
          <li>予算・ターゲティング・入札・既存広告の設定は変更しません。</li>
          <li>Metaの広告審査が完了するまで配信は始まりません。</li>
          <li>同じ広告セット内での比較のため、厳密なランダム割付（Split Test）ではありません。</li>
          {p.isMock && <li>デモ環境のため、実際のMetaには送信されません（MockAdsProvider）。</li>}
        </ul>
        <div className="field" style={{ marginTop: 10 }}>
          <label>
            <input type="radio" checked={startNow} onChange={() => setStartNow(true)} /> すぐに配信を開始する（ACTIVE）
          </label>
          <label>
            <input type="radio" checked={!startNow} onChange={() => setStartNow(false)} /> 停止状態で作成し、Ads Managerで確認してから開始する（PAUSED）
          </label>
        </div>
        <label style={{ fontSize: 10 }}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-testid="confirm-check" /> 内容を確認しました。Metaへ反映します。
        </label>
      </Modal>

      <Modal
        open={dialog === "activate"}
        title="配信を開始しますか？"
        intro="停止状態で作成したChallenger広告をACTIVEにします。予算・ターゲティングは変更しません。"
        onClose={() => setDialog(null)}
        actions={
          <>
            <button className="button" onClick={() => setDialog(null)}>
              キャンセル
            </button>
            <button className="button primary" disabled={pending} onClick={() => exec("activate", "配信を開始しました")}>
              配信を開始
            </button>
          </>
        }
      >
        <p className="field-hint">この操作はあなたの承認として監査ログに記録されます。</p>
      </Modal>

      <Modal
        open={dialog === "complete"}
        title="テスト結果を確定"
        intro="判定はデータに基づいて自動計算されます。データが足りない場合は「データ不足」のまま完了し、勝者は決めません。"
        onClose={() => setDialog(null)}
        actions={
          <>
            <button className="button" onClick={() => setDialog(null)}>
              キャンセル
            </button>
            <button className="button primary" disabled={pending} onClick={() => exec(pauseLosers ? "complete_pause_losers" : "complete", "テストを完了しました")} data-testid="confirm-complete">
              結果を確定
            </button>
          </>
        }
      >
        <div className="review-box">
          <b>判定：{p.decision === "winner" ? `勝者 ${p.winnerLabel}` : p.decision === "inconclusive" ? "差なし（決められない）" : "データ不足"}</b>
          <ul>
            {p.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
            {p.missing.map((m) => (
              <li key={m}>不足: {m}</li>
            ))}
          </ul>
          {p.decision === "winner" && <div>完了すると、勝ちパターンがCreative Memoryに保存され、次のCreative生成で使われます。</div>}
        </div>
        {p.decision === "winner" && p.canOperate && (
          <label style={{ fontSize: 10, display: "block", marginTop: 10 }}>
            <input type="checkbox" checked={pauseLosers} onChange={(e) => setPauseLosers(e.target.checked)} /> 負けた広告をMetaで停止する（任意・あなたの承認として記録）
          </label>
        )}
      </Modal>

      <Modal
        open={dialog === "cancel"}
        title="テストを中止しますか？"
        intro={p.launched ? "Meta上のChallenger広告は停止されます（Controlの現行広告はそのまま）。" : "Metaには何も送信されていません。"}
        onClose={() => setDialog(null)}
        actions={
          <>
            <button className="button" onClick={() => setDialog(null)}>
              戻る
            </button>
            <button className="button" disabled={pending} onClick={() => exec("cancel", "テストを中止しました")}>
              中止する
            </button>
          </>
        }
      >
        <p className="field-hint">仮説は「採用」状態に戻り、別のCreativeで再テストできます。</p>
      </Modal>
    </div>
  );
}
