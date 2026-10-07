import "server-only";
import type { AppContext } from "@/lib/auth/context";
import type { ID } from "@/lib/domain/types";
import { getDataMode } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DemoAdsStore } from "./demo-store";
import { AdsStoreError, type AdsStore } from "./store";
import { SupabaseAdsStore } from "./supabase-store";

/**
 * Authorization + store resolution for the ad optimization loop.
 * Same role model as lib/social/access.ts:
 *   viewer → read only; editor → drafts / analyses / approvals of creatives;
 *   owner / admin (or a location manager for their own location) → connecting
 *   ad accounts and the FINAL confirmation that sends anything to Meta.
 */
export interface AdsAccess {
  organizationId: ID;
  userId: ID;
  isDemo: boolean;
  role: AppContext["current"]["role"];
  locationIds: ID[] | null;
  reader: AdsStore;
  writer: AdsStore | null;
}

export async function getAdsContext(app: AppContext): Promise<AdsAccess> {
  const base = {
    organizationId: app.current.organization.id,
    userId: app.user.id,
    isDemo: app.current.organization.isDemo,
    role: app.current.role,
    locationIds: app.current.locationIds ?? null,
  };
  if (getDataMode() === "demo") {
    const store = new DemoAdsStore();
    return { ...base, reader: store, writer: store };
  }
  const admin = getSupabaseAdminClient();
  return {
    ...base,
    reader: new SupabaseAdsStore(await createSupabaseServerClient(), false),
    writer: admin ? new SupabaseAdsStore(admin, true) : null,
  };
}

/** Store for the background worker (no user). Null when not configured. */
export function getSystemAdsStore(): AdsStore | null {
  if (getDataMode() === "demo") return new DemoAdsStore();
  const admin = getSupabaseAdminClient();
  return admin ? new SupabaseAdsStore(admin, true) : null;
}

export function canAccessAdsLocation(ctx: Pick<AdsAccess, "locationIds">, locationId: ID | null): boolean {
  if (ctx.locationIds === null) return true;
  return locationId !== null && ctx.locationIds.includes(locationId);
}

export function assertCanEditAds(ctx: AdsAccess, locationId: ID | null): AdsStore {
  if (ctx.role === "viewer") throw new AdsStoreError("閲覧権限のため操作できません", "forbidden");
  if (!canAccessAdsLocation(ctx, locationId)) throw new AdsStoreError("この店舗の広告を操作する権限がありません", "forbidden");
  if (!ctx.writer) throw new AdsStoreError("広告連携のサーバー設定（SUPABASE_SERVICE_ROLE_KEY）がありません", "unavailable");
  return ctx.writer;
}

/**
 * Actions that change something on Meta (create ads, start / pause / activate)
 * and connecting ad accounts: owner / admin, or a location manager for their
 * own location. Plain editors can prepare everything but not press "send".
 */
export function assertCanOperateAds(ctx: AdsAccess, locationId: ID | null): AdsStore {
  if (ctx.role === "editor" && ctx.locationIds === null) {
    throw new AdsStoreError("Metaへの反映は管理者（owner / admin）または店舗マネージャーのみ実行できます", "forbidden");
  }
  return assertCanEditAds(ctx, locationId);
}

export function filterAdsByLocation<T extends { locationId: ID | null }>(ctx: Pick<AdsAccess, "locationIds">, rows: T[]): T[] {
  return rows.filter((r) => canAccessAdsLocation(ctx, r.locationId));
}
