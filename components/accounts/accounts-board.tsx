"use client";

import Link from "next/link";
import { useState } from "react";
import type { AccountGoal, SnsAccount, SnsAccountInput } from "@/lib/domain/types";
import { ACCOUNT_GOALS } from "@/lib/domain/types";
import { ACCOUNT_GOAL_LABELS, PLATFORM_ICONS, PLATFORM_LABELS } from "@/lib/domain/labels";
import { GOAL_PRESETS } from "@/lib/brand/account-goals";
import { EmptyState } from "@/components/ui/states";
import { AccountEditor, newAccountInput } from "./account-editor";

export function AccountsBoard({
  accounts,
  locations,
  postCounts,
  readOnly,
}: {
  accounts: SnsAccount[];
  locations: { id: string; name: string }[];
  postCounts: Record<string, number>;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState<{ account: SnsAccount | null; initial: SnsAccountInput } | null>(null);
  const locationName = (id: string | null) => (id ? (locations.find((l) => l.id === id)?.name ?? "削除された店舗") : "本部");
  const open = (account: SnsAccount | null, goal?: AccountGoal) =>
    setEditing({
      account,
      initial: account
        ? { platform: account.platform, handle: account.handle, displayName: account.displayName, locationId: account.locationId, goal: account.goal, strategy: account.strategy }
        : newAccountInput(goal),
    });

  return (
    <>
      {accounts.length === 0 && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <EmptyState icon="◈" title="SNSアカウントがまだありません"
            description="集客・採用・ブランディングなど、目的ごとにアカウントを登録して運用戦略を決めましょう。"
            action={!readOnly ? <button className="button small soft" onClick={() => open(null)}>＋ アカウントを追加</button> : undefined} />
        </div>
      )}
      {ACCOUNT_GOALS.map((goal) => {
        const list = accounts.filter((a) => a.goal === goal);
        return (
          <section className="goal-section" key={goal}>
            <div className="goal-head">
              <h2>{ACCOUNT_GOAL_LABELS[goal]}</h2>
              <span>{GOAL_PRESETS[goal].description}</span>
              {!readOnly && (
                <button className="button small" style={{ marginLeft: "auto" }} onClick={() => open(null, goal)}>＋ 追加</button>
              )}
            </div>
            {list.length === 0 ? (
              <p className="activity-note">{ACCOUNT_GOAL_LABELS[goal]}目的のアカウントはありません。</p>
            ) : (
              <div className="account-grid">
                {list.map((a) => (
                  <article className="account-card" key={a.id}>
                    <div className="account-card-head">
                      <span className={`platform-dot ${a.platform === "threads" ? "threads" : a.platform === "tiktok" ? "tiktok" : ""}`}>{PLATFORM_ICONS[a.platform]}</span>
                      <div>
                        <b>{a.handle}</b>
                        <small>{PLATFORM_LABELS[a.platform]}{a.displayName ? ` · ${a.displayName}` : ""}</small>
                      </div>
                      {!readOnly && <button className="button small" onClick={() => open(a)} aria-label={`${a.handle}を編集`}>編集</button>}
                    </div>
                    <div className="account-meta">
                      <span className={`goal-pill ${a.goal}`}>{ACCOUNT_GOAL_LABELS[a.goal]}</span>
                      <span className="loc-pill">{locationName(a.locationId)}</span>
                      <span className="loc-pill">週{a.strategy.postsPerWeek}本</span>
                      <span className="status-pill draft">未連携</span>
                    </div>
                    <div className="strategy-line"><b>ペルソナ</b>{a.strategy.persona || "未設定"}</div>
                    <div className="strategy-line"><b>KPI</b>{a.strategy.kpis.join("・") || "未設定"}</div>
                    <div className="strategy-line"><b>柱</b>{a.strategy.contentPillars.join("・") || "未設定"}</div>
                    <div className="strategy-line"><b>CTA</b>{a.strategy.cta || "未設定"}</div>
                    <div className="strategy-line"><b>トーン</b>{a.strategy.tone || "Brand Brainに従う"}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                      <span className="activity-note">登録済み投稿 {postCounts[a.id] ?? 0}本</span>
                      <Link className="button small soft" href={`/creator?account=${a.id}`}>このアカウントで投稿作成 →</Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        );
      })}
      {editing && (
        <AccountEditor account={editing.account} initial={editing.initial} locations={locations} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
