// Typed wrappers for the org-admin-scope RPCs defined in
// supabase/org_admin_scopes.sql. These are not in the generated Supabase types
// (src/integrations/supabase/types.ts is do-not-edit / regenerated separately),
// so we call them by name and shape the result here — keeping the untyped
// surface confined to this one file. No `any`.
import { supabase } from "@/integrations/supabase/client";

export type OrgAdminScope = "owner" | "billing" | "academic";

const VALID_SCOPES: readonly OrgAdminScope[] = ["owner", "billing", "academic"];

function toScope(value: unknown): OrgAdminScope | null {
  return VALID_SCOPES.includes(value as OrgAdminScope) ? (value as OrgAdminScope) : null;
}

/** The authenticated admin's scopes for their org (empty if none). */
export async function getMyOrgAdminScopes(): Promise<OrgAdminScope[]> {
  const { data, error } = await supabase.rpc("get_my_org_admin_scopes" as never);
  if (error || !data) return [];
  const rows = data as unknown as { scope: string }[];
  return rows
    .map((r) => toScope(r.scope))
    .filter((s): s is OrgAdminScope => s !== null);
}

export interface OrgAdminRow {
  user_id: string;
  full_name: string | null;
  scopes: OrgAdminScope[];
}

/** Every admin in the caller's org with their assigned scopes (owner-facing). */
export async function listOrgAdminScopes(): Promise<OrgAdminRow[]> {
  const { data, error } = await supabase.rpc("list_org_admins_with_scopes" as never);
  if (error || !data) return [];
  const rows = data as unknown as { user_id: string; full_name: string | null; scope: string | null }[];

  // The RPC returns one row per (admin, scope); group into one entry per admin.
  const byUser = new Map<string, OrgAdminRow>();
  for (const row of rows) {
    let entry = byUser.get(row.user_id);
    if (!entry) {
      entry = { user_id: row.user_id, full_name: row.full_name, scopes: [] };
      byUser.set(row.user_id, entry);
    }
    const scope = toScope(row.scope);
    if (scope) entry.scopes.push(scope);
  }
  return Array.from(byUser.values());
}

/** Owner-only: replace a target admin's scope set. */
export async function setOrgAdminScopes(
  targetUserId: string,
  scopes: OrgAdminScope[],
): Promise<void> {
  const { error } = await supabase.rpc(
    "set_org_admin_scopes" as never,
    { p_target_user: targetUserId, p_scopes: scopes } as never,
  );
  if (error) throw error;
}

/** Seed the caller's default scope right after they join/create an org. */
export async function ensureDefaultAdminScope(): Promise<void> {
  await supabase.rpc("ensure_default_admin_scope" as never);
}
