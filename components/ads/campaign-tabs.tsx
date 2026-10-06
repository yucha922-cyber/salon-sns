"use client";

import { useState } from "react";
import type { Campaign } from "@/lib/domain/types";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/domain/labels";

const fmt = (n: number) => new Intl.NumberFormat("ja-JP").format(n);

export function CampaignTable({ campaigns }: { campaigns: Campaign[] }) {
  const [tab, setTab] = useState<"campaign" | "adset" | "creative">("campaign");
  return (
    <>
      <div className="tabs" role="tablist">
        {([["campaign", "キャンペーン"], ["adset", "広告セット"], ["creative", "クリエイティブ"]] as const).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {tab !== "campaign" ? (
        <p className="activity-note">広告セット・クリエイティブ単位の表示は、Meta Marketing API連携後に対応します。</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>キャンペーン</th><th>ステータス</th><th>費用</th><th>インプレッション</th><th>CTR</th><th>CV</th><th>CPA</th><th>ROAS</th></tr></thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td><div className="campaign-name"><span className="table-marker">⌁</span><b>{c.name}</b></div></td>
                  <td><span className={`status-pill ${c.status === "paused" ? "draft" : c.status === "needs_review" ? "review" : ""}`}>{CAMPAIGN_STATUS_LABELS[c.status]}</span></td>
                  <td>¥{fmt(c.spend)}</td>
                  <td>{fmt(c.impressions)}</td>
                  <td>{c.ctr}%</td>
                  <td>{c.conversions}</td>
                  <td>¥{fmt(Math.round(c.spend / Math.max(1, c.conversions)))}</td>
                  <td className="table-strong">{c.roas}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
