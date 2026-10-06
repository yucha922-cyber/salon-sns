import Link from "next/link";
import type { ReactNode } from "react";

export function EmptyState({
  icon = "✧",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description: string;
  action?: { label: string; href: string } | ReactNode;
}) {
  return (
    <div className="empty-panel">
      <div className="empty-icon">{icon}</div>
      <b>{title}</b>
      <p>{description}</p>
      {action && typeof action === "object" && "href" in action ? (
        <Link className="button small soft" href={action.href}>
          {action.label}
        </Link>
      ) : (
        action
      )}
    </div>
  );
}

export function SkeletonLines({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton skeleton-line" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}
