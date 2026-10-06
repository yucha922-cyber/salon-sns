"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AccountGoal } from "@/lib/domain/types";
import { ACCOUNT_GOAL_LABELS } from "@/lib/domain/labels";
import type { AccountCandidate, PublishablePlatform } from "@/lib/social/types";
import { completeConnectionAction } from "@/app/actions/social";
import { Spinner } from "@/components/ui/states";

export function ConnectAccountForm({
  pendingId,
  platform,
  candidates,
  accounts,
  locations,
  allowHq,
  preselectAccountId,
}: {
  pendingId: string;
  platform: PublishablePlatform;
  candidates: AccountCandidate[];
  accounts: { id: string; label: string; connected: boolean }[];
  locations: { id: string; name: string }[];
  allowHq: boolean;
  preselectAccountId: string | null;
}) {
  const router = useRouter();
  const [candidate, setCandidate] = useState(candidates[0]?.externalAccountId ?? "");
  const [mode, setMode] = useState<"existing" | "new">(preselectAccountId || accounts.length ? "existing" : "new");
  const [accountId, setAccountId] = useState(preselectAccountId ?? accounts[0]?.id ?? "");
  const [locationId, setLocationId] = useState<string>(allowHq ? "" : (locations[0]?.id ?? ""));
  const [goal, setGoal] = useState<AccountGoal>("acquisition");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selected = candidates.find((c) => c.externalAccountId === candidate);
  const label = platform === "instagram" ? "Instagram" : "Threads";

  const save = () =>
    startTransition(async () => {
      setError(null);
      const result = await completeConnectionAction({
        pendingId,
        externalAccountId: candidate,
        target: mode === "existing" ? { mode, accountId } : { mode, locationId: locationId || null, goal, displayName },
      });
      if (!result.ok) return setError(result.error);
      router.push(`/accounts?connected=${encodeURIComponent(result.data.handle)}`);
      router.refresh();
    });

  return (
    <div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="field">
        <label>認可された{label}アカウント</label>
        {candidates.map((c) => (
          <label key={c.externalAccountId} className="candidate-card" style={{ cursor: "pointer" }}>
            <input type="radio" name="candidate" checked={candidate === c.externalAccountId} onChange={() => setCandidate(c.externalAccountId)} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {c.profileImageUrl ? <img src={c.profileImageUrl} alt="" /> : <span className="social-brand-avatar">{label[0]}</span>}
            <div>
              <b>@{c.username}</b>
              <small className="activity-note" style={{ display: "block" }}>
                {c.displayName} {c.metadata.account_type ? `· ${c.metadata.account_type === "MEDIA_CREATOR" ? "クリエイター" : "ビジネス"}アカウント` : ""}{" "}
                {typeof c.metadata.followers_count === "number" ? `· フォロワー ${c.metadata.followers_count.toLocaleString()}` : ""}
              </small>
            </div>
          </label>
        ))}
      </div>

      <div className="field">
        <label>このアカウントの使い道</label>
        <div className="chip-options" role="radiogroup">
          <button type="button" className={`choice-chip ${mode === "existing" ? "selected" : ""}`} onClick={() => setMode("existing")} disabled={!accounts.length}>登録済みのアカウント戦略に紐付ける</button>
          <button type="button" className={`choice-chip ${mode === "new" ? "selected" : ""}`} onClick={() => setMode("new")}>新しいアカウントとして追加（新店舗など）</button>
        </div>
      </div>

      {mode === "existing" ? (
        <div className="field">
          <label htmlFor="targetAccount">紐付けるアカウント</label>
          <select id="targetAccount" className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}{a.connected ? "（接続済み → 置き換え）" : ""}</option>)}
          </select>
        </div>
      ) : (
        <div className="two-fields">
          <div className="field">
            <label htmlFor="newLocation">店舗</label>
            <select id="newLocation" className="select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {allowHq && <option value="">本部（HQ）</option>}
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="newGoal">目的</label>
            <select id="newGoal" className="select" value={goal} onChange={(e) => setGoal(e.target.value as AccountGoal)}>
              {(["acquisition", "recruitment", "branding", "engagement", "retention"] as const).map((g) => <option key={g} value={g}>{ACCOUNT_GOAL_LABELS[g]}</option>)}
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="newName">表示名（任意）</label>
            <input id="newName" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例：新宿院 Instagram" maxLength={80} />
          </div>
        </div>
      )}

      <div className="recommendation-callout" style={{ margin: "6px 0 14px" }}>
        保存すると <b>@{selected?.username}</b> が{" "}
        <b>{mode === "existing" ? (accounts.find((a) => a.id === accountId)?.label ?? "選択したアカウント") : `${locations.find((l) => l.id === locationId)?.name ?? "本部"} の${ACCOUNT_GOAL_LABELS[goal]}アカウント`}</b>{" "}
        として接続されます。投稿は、投稿内容の承認と予約（または「今すぐ投稿」の確認）をしたものだけが公開されます。
      </div>
      <button className="button primary" onClick={save} disabled={pending || !candidate || (mode === "existing" && !accountId)}>
        {pending && <Spinner />} この内容で接続する
      </button>
    </div>
  );
}
