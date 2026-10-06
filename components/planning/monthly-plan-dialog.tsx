"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SnsAccount } from "@/lib/domain/types";
import { goalLabel, PLATFORM_LABELS } from "@/lib/domain/labels";
import { generateMonthlyPlanAction } from "@/app/actions/planning";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/form";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

export function MonthlyPlanButton({
  accounts,
  locations,
  campaigns,
  months,
  defaultAccountId,
  defaultMonth,
}: {
  accounts: SnsAccount[];
  locations: { id: string; name: string }[];
  campaigns: { id: string; name: string; goal: string }[];
  months: string[];
  defaultAccountId: string;
  defaultMonth: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(defaultAccountId || (accounts[0]?.id ?? ""));
  const [month, setMonth] = useState(months.includes(defaultMonth) ? defaultMonth : (months[0] ?? ""));
  const [campaignId, setCampaignId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const account = accounts.find((a) => a.id === accountId);
  const locName = (id: string | null) => (id ? (locations.find((l) => l.id === id)?.name ?? "") : "本部");
  const weeks = 4.3;

  const generate = () =>
    startTransition(async () => {
      const result = await generateMonthlyPlanAction({ accountId, month, hqCampaignId: campaignId || null, notes });
      if (!result.ok) return setError(result.error);
      toast(`${result.data.items}件の企画案を作成しました。確認して承認してください`);
      setOpen(false);
      router.push(`/planner/proposals/${result.data.proposalId}`);
    });

  return (
    <>
      <button className="button primary" onClick={() => setOpen(true)} disabled={!accounts.length} title={!accounts.length ? "先にアカウント戦略でSNSアカウントを登録してください" : undefined}>
        ✳ AIで1ヶ月分作成
      </button>
      <Modal
        open={open}
        title="AIで1ヶ月分の投稿計画を作成"
        intro="アカウント戦略（目的・投稿頻度・曜日・時間・柱）とBrand Brain・店舗情報・本部テーマから企画案を作ります。まだカレンダーには追加されません。確認画面で承認したものだけが追加されます。"
        onClose={() => setOpen(false)}
        actions={
          <>
            <button className="button" onClick={() => setOpen(false)}>キャンセル</button>
            <button className="button primary" onClick={generate} disabled={pending || !accountId || !month}>
              {pending ? <><Spinner /> 企画を作成中…</> : "企画案を作成"}
            </button>
          </>
        }
      >
        {error && <div className="form-error" role="alert">{error}</div>}
        <Field label="SNSアカウント" htmlFor="planAccount">
          <select id="planAccount" className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{locName(a.locationId)} / {PLATFORM_LABELS[a.platform]} {a.handle}（{goalLabel(a.goal, a.customGoal)}）</option>
            ))}
          </select>
        </Field>
        {account && (
          <div className="recommendation-callout" style={{ marginBottom: 14 }}>
            目的：<b>{goalLabel(account.goal, account.customGoal)}</b> · 週{account.strategy.postsPerWeek}本 → 約{Math.round(account.strategy.postsPerWeek * weeks)}件
            {account.goal === "acquisition" && "（ファネル：認知→悩み→教育→信頼→来店→予約）"}
            {account.goal === "recruitment" && "（ファネル：認知→興味→共感→職場理解→キャリア理解→応募）"}
          </div>
        )}
        <div className="two-fields">
          <Field label="対象月" htmlFor="planMonth">
            <select id="planMonth" className="select" value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{m.replace("-", "年")}月</option>)}
            </select>
          </Field>
          <Field label="本部キャンペーン" htmlFor="planCampaign" optional>
            <select id="planCampaign" className="select" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">使わない</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="AIへの補足" htmlFor="planNotes" optional>
          <input id="planNotes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="例：月末に新メニュー告知を1本入れたい" />
        </Field>
      </Modal>
    </>
  );
}
