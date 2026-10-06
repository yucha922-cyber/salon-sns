import "server-only";
import type { AppContext } from "@/lib/auth/context";
import type { ID, SnsAccount } from "@/lib/domain/types";
import { getDataMode } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import type { DataRepository } from "@/lib/data/repository";
import { DemoRepository } from "@/lib/data/demo-repository";
import { SupabaseRepository } from "@/lib/data/supabase-repository";
import { newId } from "@/lib/data/demo-store";
import { DemoSocialStore } from "./demo-store";
import { SocialStoreError, type SocialStore } from "./store";
import { SupabaseSocialStore } from "./supabase-store";

/** Placeholder actor for worker-side reads (never written as a user reference). */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Authorization + store resolution for the publishing loop.
 *
 * Roles (current enum → product roles):
 *   owner  = HQ Admin, admin = Organization Admin,
 *   editor = Editor (or Location Manager when organization_members.location_ids is set),
 *   viewer = Viewer (read only).
 */
export interface SocialContext {
  organizationId: ID;
  userId: ID;
  isDemo: boolean;
  timezone: string;
  role: AppContext["current"]["role"];
  /** null = all locations + HQ accounts */
  locationIds: ID[] | null;
  /** RLS-bound store for reads */
  reader: SocialStore;
  /** privileged store for pipeline writes; null when SUPABASE_SERVICE_ROLE_KEY is missing */
  writer: SocialStore | null;
}

export async function getSocialContext(app: AppContext): Promise<SocialContext> {
  const base = {
    organizationId: app.current.organization.id,
    userId: app.user.id,
    isDemo: app.current.organization.isDemo,
    timezone: app.current.organization.timezone ?? "Asia/Tokyo",
    role: app.current.role,
    locationIds: app.current.locationIds ?? null,
  };
  if (getDataMode() === "demo") {
    const store = new DemoSocialStore();
    return { ...base, reader: store, writer: store };
  }
  const admin = getSupabaseAdminClient();
  return {
    ...base,
    reader: new SupabaseSocialStore(await createSupabaseServerClient(), false),
    writer: admin ? new SupabaseSocialStore(admin, true) : null,
  };
}

/** Data repository for the background worker (no user session). */
export function getSystemRepository(): DataRepository | null {
  if (getDataMode() === "demo") return new DemoRepository(SYSTEM_USER_ID, newId, { system: true });
  const admin = getSupabaseAdminClient();
  return admin ? new SupabaseRepository(admin as unknown as ServerSupabaseClient, SYSTEM_USER_ID) : null;
}

/** Store for the background worker (no user). Null when not configured. */
export function getSystemStore(): SocialStore | null {
  if (getDataMode() === "demo") return new DemoSocialStore();
  const admin = getSupabaseAdminClient();
  return admin ? new SupabaseSocialStore(admin, true) : null;
}

export function canAccessLocation(ctx: Pick<SocialContext, "locationIds">, locationId: ID | null): boolean {
  if (ctx.locationIds === null) return true;
  return locationId !== null && ctx.locationIds.includes(locationId);
}

export function assertCanEdit(ctx: SocialContext, locationId: ID | null): SocialStore {
  if (ctx.role === "viewer") throw new SocialStoreError("閲覧権限のため操作できません", "forbidden");
  if (!canAccessLocation(ctx, locationId)) throw new SocialStoreError("この店舗を操作する権限がありません", "forbidden");
  if (!ctx.writer) throw new SocialStoreError("SNS連携のサーバー設定（SUPABASE_SERVICE_ROLE_KEY）がありません", "unavailable");
  return ctx.writer;
}

/** Connect / disconnect require org admin (or a location manager for their own location). */
export function assertCanManageConnection(ctx: SocialContext, account: Pick<SnsAccount, "locationId"> | null): SocialStore {
  if (ctx.role === "viewer") throw new SocialStoreError("閲覧権限のため操作できません", "forbidden");
  if (ctx.role === "editor" && ctx.locationIds === null) {
    // Plain editors create content; connecting accounts is an admin task.
    throw new SocialStoreError("SNSアカウントの接続は管理者（owner / admin）または店舗マネージャーのみ行えます", "forbidden");
  }
  return assertCanEdit(ctx, account?.locationId ?? null);
}

export function filterByLocation<T extends { locationId: ID | null }>(ctx: Pick<SocialContext, "locationIds">, rows: T[]): T[] {
  return rows.filter((r) => canAccessLocation(ctx, r.locationId));
}
