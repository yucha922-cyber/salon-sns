"use client";

import Link from "next/link";
import { useState } from "react";
import type { AccountGoal, ContentPillar, SnsAccount, SnsAccountInput } from "@/lib/domain/types";
import { ACCOUNT_GOALS } from "@/lib/domain/types";
import { ACCOUNT_GOAL_LABELS, goalLabel, PLATFORM_ICONS, PLATFORM_LABELS, WEEKDAY_LABELS } from "@/lib/domain/labels";
import { GOAL_PRESETS } from "@/lib/brand/account-goals";
import { pillarLabel } from "@/lib/brand/content-pillars";
import { EmptyState } from "@/components/ui/states";
import { AccountEditor, newAccountInput, toAccountInput } from "./account-editor";
import { ConnectionControls } from "@/components/social/connection-controls";

type Editing = { account: SnsAccount | null; initial: SnsAccountInput };

export function AccountsBoard({
  accounts,
  locations,
  pillars,
  postCounts,
  readOnly,
  canManageConnections = false,
}: {
  accounts: SnsAccount[];
  locations: { id: string; name: string }[];
  pillars: ContentPillar[];
  postCounts: Record<string, number>;
  readOnly: boolean;
  canManageConnections?: boolean;
}) {
  const [view, setView] = useState<"tree" | "goal">("tree");
  const [editing, setEditing] = useState<Editing | null>(null);
  const locationName = (id: string | null) => (id ? (locations.find((l) => l.id === id)?.name ?? "削除された店舗") : "本部");
  const open = (account: SnsAccount | null, goal?: AccountGoal, locationId: string | null = null) =>
    setEditing({ account, initial: account ? toAccountInput(account) : newAccountInput(goal, locationId) });

  const card = (a: SnsAccount) => (
    <article className={`account-card ${a.active ? "" : "inactive"}`} key={a.id}>
      <div className="account-card-head">
        <span className={`platform-dot ${a.platform === "threads" ? "threads" : a.platform === "tiktok" ? "tiktok" : ""}`}>{PLATFORM_ICONS[a.platform]}</span>
        <div>
          <b>{a.handle}</b>
          <small>{PLATFORM_LABELS[a.platform]}{a.displayName ? ` · ${a.displayName}` : ""}</small>
        </div>
        {!readOnly && <button className="button small" onClick={() => open(a)} aria-label={`${a.handle}の戦略を編集`}>戦略を編集</button>}
      </div>
      <div className="account-meta">
        <span className={`goal-pill ${a.goal}`}>{goalLabel(a.goal, a.customGoal)}</span>
        <span className="loc-pill">{locationName(a.locationId)}</span>
        <span className="loc-pill">週{a.strategy.postsPerWeek}本</span>
        {!a.active && <span className="status-pill draft">停止中</span>}
      </div>
      <ConnectionControls account={a} canManage={canManageConnections} />
      <div className="strategy-line"><b>ターゲット</b>{a.strategy.targetAudience || "未設定"}</div>
      <div className="strategy-line"><b>KPI</b>{a.strategy.kpiTargets.map((k) => (k.target === null ? k.metric : `${k.metric} ${k.target}${k.unit}`)).join("・") || "未設定"}</div>
      <div className="strategy-line"><b>柱</b>{a.strategy.contentPillars.map((p) => pillarLabel(p, pillars)).join("・") || "未設定"}</div>
      <div className="strategy-line"><b>投稿</b>{a.strategy.preferredPostingDays.map((d) => WEEKDAY_LABELS[d]).join("・") || "曜日未設定"} {a.strategy.preferredPostingTimes.join("・")}</div>
      <div className="strategy-line"><b>CTA</b>{a.strategy.cta || "未設定"}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2, gap: 6 }}>
        <span className="activity-note">登録済み投稿 {postCounts[a.id] ?? 0}本</span>
        <Link className="button small soft" href={`/planner?account=${a.id}`}>計画を見る →</Link>
      </div>
    </article>
  );

  const groups =
    view === "tree"
      ? [{ key: "hq", title: "本部（HQ）", sub: "店舗に紐づかないアカウント", list: accounts.filter((a) => !a.locationId), locationId: null as string | null, goal: undefined as AccountGoal | undefined },
         ...locations.map((l) => ({ key: l.id, title: l.name, sub: "店舗アカウント", list: accounts.filter((a) => a.locationId === l.id), locationId: l.id, goal: undefined as AccountGoal | undefined }))]
      : ACCOUNT_GOALS.map((g) => ({ key: g, title: ACCOUNT_GOAL_LABELS[g], sub: GOAL_PRESETS[g].description, list: accounts.filter((a) => a.goal === g), locationId: null as string | null, goal: g as AccountGoal | undefined }))
          .filter((g) => g.list.length || g.goal === "acquisition" || g.goal === "recruitment");

  return (
    <>
      <div className="scope-bar">
        <div className="view-toggle" role="tablist" aria-label="表示切替">
          <button role="tab" aria-selected={view === "tree"} className={view === "tree" ? "active" : ""} onClick={() => setView("tree")}>店舗別</button>
          <button role="tab" aria-selected={view === "goal"} className={view === "goal" ? "active" : ""} onClick={() => setView("goal")}>目的別</button>
        </div>
        <span className="activity-note">
          {accounts.filter((a) => a.active).length}アカウント運用中 · 集客 {accounts.filter((a) => a.active && a.goal === "acquisition").length} · 採用 {accounts.filter((a) => a.active && a.goal === "recruitment").length}
        </span>
        {!readOnly && <button className="button small primary" style={{ marginLeft: "auto" }} onClick={() => open(null)}>＋ アカウントを追加</button>}
      </div>
      {accounts.length === 0 && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <EmptyState icon="◈" title="SNSアカウントがまだありません" description="「このInstagramは集客用」「このThreadsは採用用」のように、目的ごとにアカウントを登録しましょう。"
            action={!readOnly ? <button className="button small soft" onClick={() => open(null)}>＋ アカウントを追加</button> : undefined} />
        </div>
      )}
      {groups.map((g) => (
        <section className="tree-group" key={g.key}>
          <div className="tree-head">
            <h2>{g.title}</h2>
            <span className="activity-note">{g.sub}</span>
            {!readOnly && <button className="button small" style={{ marginLeft: "auto" }} onClick={() => open(null, g.goal, g.locationId)}>＋ 追加</button>}
          </div>
          {g.list.length ? <div className="account-grid">{g.list.map(card)}</div> : <p className="activity-note">アカウントはありません。</p>}
        </section>
      ))}
      {editing && (
        <AccountEditor account={editing.account} initial={editing.initial} locations={locations} pillars={pillars} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
