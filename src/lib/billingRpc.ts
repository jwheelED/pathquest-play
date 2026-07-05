// Typed wrappers for the institutional-billing RPCs defined in
// supabase/institutional_billing.sql. These functions are not yet in the
// generated Supabase types (src/integrations/supabase/types.ts is do-not-edit
// and regenerated separately), so we call them by name and shape the result
// here — keeping the untyped surface confined to this one file.
import { supabase } from "@/integrations/supabase/client";

export interface OrgBillingSummary {
  has_plan: boolean;
  tier_name: string | null;
  tier_display: string | null;
  annual_price_cents: number | null;
  included_minutes: number | null;
  used_minutes: number;
  period_end: string | null;
}

/** Billing summary for the authenticated user's org, or null if none. */
export async function getOrgBillingSummary(): Promise<OrgBillingSummary | null> {
  const { data, error } = await supabase.rpc("get_org_billing_summary" as never);
  if (error || !data) return null;
  const rows = data as unknown as OrgBillingSummary[];
  const summary = rows[0];
  return summary?.has_plan ? summary : null;
}

/** Record consumed lecture minutes against the instructor's org hour pool. */
export async function recordOrgLectureMinutes(
  instructorId: string,
  minutes: number,
): Promise<void> {
  await supabase.rpc(
    "record_org_lecture_minutes" as never,
    { p_instructor_id: instructorId, p_minutes: minutes } as never,
  );
}
