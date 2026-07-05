// Shared billing helpers for Stripe-backed instructor subscriptions.
//
// The instructor tiers are FLAT monthly recurring subscriptions in Stripe.
// Stripe has no concept of "40 hrs/month" — the hour cap is enforced in our
// own database via `instructor_usage_tracking` + the `add_lecture_minutes`
// RPC. This module is the single source of truth for the tier -> monthly
// minute allowance mapping, and for wiring Stripe into edge functions.
//
// NEVER import this from client code — it references the service role key.
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Monthly lecture-minute allowance per instructor tier.
 * Mirrors the pricing model: Free 3h, Starter 15h, Pro 40h.
 * Kept in code (not a DB column) so we don't have to alter the schema —
 * the webhook stamps the resolved value onto instructor_usage_tracking.
 */
export const TIER_MINUTE_LIMITS: Record<string, number> = {
  free: 3 * 60, // 180
  starter: 15 * 60, // 900
  pro: 40 * 60, // 2400
};

export const FREE_TIER_MINUTES = TIER_MINUTE_LIMITS.free;

export function minutesForTier(tierName: string | null | undefined): number {
  if (!tierName) return FREE_TIER_MINUTES;
  return TIER_MINUTE_LIMITS[tierName] ?? FREE_TIER_MINUTES;
}

export function getStripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, {
    apiVersion: "2025-01-27.acacia",
    // Deno-friendly HTTP client (uses fetch instead of Node http).
    httpClient: Stripe.createFetchHttpClient(),
  });
}

/** Service-role client for privileged writes (subscriptions, usage). */
export function getAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey);
}

/** Resolve the authenticated user id from the request's JWT, or null. */
export async function getUserFromRequest(
  authHeader: string | null,
): Promise<{ id: string; email: string | null } | null> {
  if (!authHeader) return null;
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return null;
  return { id: user.id, email: user.email ?? null };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Find or create the Stripe customer for an instructor. We reuse an existing
 * customer id from any prior subscription row for this user so repeat
 * checkouts / portal visits map to the same Stripe customer.
 */
export async function getOrCreateCustomer(
  stripe: Stripe,
  admin: SupabaseClient,
  userId: string,
  email: string | null,
): Promise<string> {
  const { data: existing } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .not("stripe_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { supabase_user_id: userId },
  });
  return customer.id;
}

/**
 * Stamp the current month's minute allowance for an instructor to match their
 * active tier. Idempotent: upserts the current usage_month row and only sets
 * the limit (never touches minutes_used, so mid-month upgrades keep usage).
 */
export async function setInstructorMinuteLimit(
  admin: SupabaseClient,
  instructorId: string,
  tierName: string,
): Promise<void> {
  const limit = minutesForTier(tierName);
  const usageMonth = new Date().toISOString().slice(0, 7) + "-01"; // YYYY-MM-01

  const { data: orgRow } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", instructorId)
    .maybeSingle();

  await admin
    .from("instructor_usage_tracking")
    .upsert(
      {
        instructor_id: instructorId,
        usage_month: usageMonth,
        minutes_limit: limit,
        org_id: orgRow?.org_id ?? null,
      },
      { onConflict: "instructor_id,usage_month" },
    );
}
