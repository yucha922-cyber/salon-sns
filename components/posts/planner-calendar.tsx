"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Post } from "@/lib/domain/types";
import { PLATFORM_LABELS } from "@/lib/domain/labels";
import { jstDateKey, jstTime, monthGrid } from "@/lib/domain/dates";
import { PostEditModal } from "./post-edit-modal";

export function PlannerCalendar({
  posts,
  year,
  month,
  todayKey,
  highlightId,
}: {
  posts: Post[];
  year: number;
  month: number;
  todayKey: string;
  highlightId?: string;
}) {
  const [editing, setEditing] = useState<Post | null>(null);
  const [platform, setPlatform] = useState("all");
  const byDay = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of posts) {
      if (!p.scheduledAt || (platform !== "all" && p.platform !== platform)) continue;
      const key = jstDateKey(new Date(p.scheduledAt));
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return map;
  }, [posts, platform]);

  return (
    <>
      <div className="heading-actions" style={{ position: "absolute", right: 18, top: 16 }}>
        <select className="select-small" aria-label="SNSで絞り込み" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="all">すべてのSNS</option>
          {Object.entries(PLATFORM_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      <div className="calendar-grid">
        {["日", "月", "火", "水", "木", "金", "土"].map((d) => <div key={d} className="weekday">{d}</div>)}
        {monthGrid({ year, month }).map((cell) => (
          <div key={cell.key} className={`day-cell ${cell.inMonth && cell.key === todayKey ? "today" : ""}`}>
            <Link href={`/creator?date=${cell.key}`} className={`day-num ${cell.inMonth ? "" : "dim"}`} style={{ textDecoration: "none" }}
              title="この日に投稿を作成">
              {cell.day}
            </Link>
            {(byDay.get(cell.key) ?? []).map((p) => (
              <button
                key={p.id}
                className={`calendar-event ${p.platform === "threads" ? "thread" : p.contentType === "feed" ? "story" : ""}`}
                style={p.id === highlightId ? { boxShadow: "0 0 0 2px #8db5a7" } : p.status === "draft" ? { opacity: 0.75 } : undefined}
                onClick={() => setEditing(p)}
              >
                <b>{jstTime(p.scheduledAt ?? p.createdAt)} · {PLATFORM_LABELS[p.platform]}{p.status === "draft" ? "（下書き）" : ""}</b>
                {p.title}
              </button>
            ))}
          </div>
        ))}
      </div>
      <PostEditModal post={editing} onClose={() => setEditing(null)} />
    </>
  );
}
