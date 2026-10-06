import { CONNECTION_BADGE_HINTS, CONNECTION_BADGE_LABELS, connectionBadge } from "@/lib/social/connection";
import type { ConnectionBadge as Badge, SocialConnectionInfo } from "@/lib/social/types";

export function ConnectionBadge({ connection, badge }: { connection?: SocialConnectionInfo; badge?: Badge }) {
  const b = badge ?? (connection ? connectionBadge(connection) : "not_connected");
  return (
    <span className={`conn-badge ${b}`} title={CONNECTION_BADGE_HINTS[b]}>
      <i aria-hidden="true" />
      {CONNECTION_BADGE_LABELS[b]}
    </span>
  );
}
