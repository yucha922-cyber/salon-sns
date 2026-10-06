"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SnsAccount } from "@/lib/domain/types";
import { goalLabel, PLATFORM_LABELS } from "@/lib/domain/labels";

/** 全店舗 / 店舗別 / SNSアカウント別 switcher, stored in ?scope= (all | loc:<id> | acc:<id>). */
export function ScopeSelect({
  value,
  locations,
  accounts,
}: {
  value: string;
  locations: { id: string; name: string }[];
  accounts: SnsAccount[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const change = (scope: string) => {
    const next = new URLSearchParams(params.toString());
    next.delete("account");
    if (scope === "all") next.delete("scope");
    else next.set("scope", scope);
    router.push(`${pathname}${next.toString() ? `?${next}` : ""}`);
  };
  const label = (a: SnsAccount) => `${PLATFORM_LABELS[a.platform]} ${a.handle}（${goalLabel(a.goal, a.customGoal)}）`;
  return (
    <div className="scope-bar">
      <label htmlFor="scopeSelect">表示範囲</label>
      <select id="scopeSelect" className="select" value={value} onChange={(e) => change(e.target.value)}>
        <option value="all">全店舗・全アカウント</option>
        <optgroup label="本部（HQ）">
          {accounts.filter((a) => !a.locationId).map((a) => <option key={a.id} value={`acc:${a.id}`}>{label(a)}</option>)}
        </optgroup>
        {locations.map((l) => (
          <optgroup key={l.id} label={l.name}>
            <option value={`loc:${l.id}`}>{l.name}（店舗全体）</option>
            {accounts.filter((a) => a.locationId === l.id).map((a) => <option key={a.id} value={`acc:${a.id}`}>└ {label(a)}</option>)}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
