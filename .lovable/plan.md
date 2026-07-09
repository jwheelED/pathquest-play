## Goal
Revise institutional plan copy on the Billing settings card to remove "lecture" wording, drop overage-rate mentions, and stop implying Department lacks reporting.

## Copy changes (per tier)

**Department — $1,499/yr**
- Description: "100 shared session hours per year for a single department. Annual contract with rollover — top up at renewal, not mid-year."
- Features:
  - 100 shared session hours / year
  - Shared across all instructors in the department
  - Usage dashboard & admin reporting
  - Unused hours roll over to next year

**Campus — $3,999/yr**
- Description: "400 shared session hours per year across your campus, with advanced admin workflows. Annual contract with rollover."
- Features:
  - 400 shared session hours / year
  - Shared across all instructors on campus
  - Advanced admin workflows & role management
  - Usage dashboard & admin reporting
  - Unused hours roll over to next year

**Enterprise — $7,999/yr**
- Description: "1,200 shared session hours per year with priority support and onboarding. Annual contract with rollover."
- Features:
  - 1,200 shared session hours / year
  - Shared across your entire organization
  - Priority support & dedicated onboarding
  - Advanced admin workflows & reporting
  - Unused hours roll over to next year

Remove every "Overage billed at $X/hr" bullet from all three tiers.

## Where the change lands

The institutional tiers are read from the `subscription_tiers` table (billing_period = `year`). A new migration will `UPDATE` the three rows (`department`, `campus`, `enterprise`) to set the revised `description` and `features` JSON. No schema changes, no UI code changes needed — `BillingSettings.tsx` already renders `display_name`, `description`, and the `features` array as-is.

For consistency, `supabase/institutional_billing.sql` (the reference seed file) will be updated with the same copy so future re-seeds don't reintroduce the old wording. Pricing, hour counts, and internal overage math in `src/lib/billingConfig.ts` remain unchanged — overage just isn't surfaced to buyers on the card.

## Out of scope
- No changes to prices, hour allotments, or the underlying pool/rollover logic.
- No changes to the monthly instructor plans.
- Admin-facing internal overage estimate (used at renewal) stays where it is — this is only about what buyers see on the pricing card.
