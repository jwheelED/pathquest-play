/**
 * Central billing feature flags.
 *
 * Checkout and the Stripe billing portal are LIVE so instructors can register a
 * subscription and manage payment details. Usage ENFORCEMENT — the monthly
 * lecture-hour limits and the 75% / 100% warnings on the Free tier — is
 * intentionally held OFF until we flip this on.
 *
 * While enforcement is off:
 *   - No instructor is blocked or warned about hour limits.
 *   - Lecture minutes are still recorded silently (see LiveSessionControls) so
 *     the usage history is ready the moment enforcement is enabled.
 *
 * Flip BILLING_ENFORCEMENT_ENABLED to `true` to activate limits + warnings.
 */
export const BILLING_ENFORCEMENT_ENABLED = false;

/**
 * Institutional tier reference data (Path 1 — track + manual overage billing).
 *
 * These are annual, org-scoped, sales-negotiated contracts. The included hour
 * pool is tracked in the DB (usage_records); overage past the pool is billed by
 * hand at the top-up rate. Note base ÷ hours ≈ topUpRate by design — the pool is
 * effectively prepaid usage.
 *
 * Keep these numbers in sync with supabase/institutional_billing.sql.
 */
export const INSTITUTIONAL_TIERS = {
  department: { hours: 100, annualPriceCents: 149900, topUpRatePerHour: 15 },
  campus: { hours: 400, annualPriceCents: 399900, topUpRatePerHour: 10 },
  enterprise: { hours: 1200, annualPriceCents: 799900, topUpRatePerHour: 6.67 },
} as const;

export type InstitutionalTierName = keyof typeof INSTITUTIONAL_TIERS;

/** Top-up ($/hour) for a tier, or null if the name isn't an institutional tier. */
export function topUpRateForTier(tierName: string | null | undefined): number | null {
  if (!tierName) return null;
  return (INSTITUTIONAL_TIERS as Record<string, { topUpRatePerHour: number }>)[tierName]
    ?.topUpRatePerHour ?? null;
}
