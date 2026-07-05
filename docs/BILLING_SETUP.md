# Billing Setup — Stripe Instructor Subscriptions

This wires the Edvana **instructor** pricing model (Free / Starter $29 / Pro $59,
monthly, hours-based) to Stripe Checkout + the Billing Portal.

> Institutional tiers (Department / Campus / Enterprise) and the one-time
> top-up / overage flow are **not** included in this slice — see "Next: Institutional".

## How it fits together

```
BillingSettings.tsx / UpgradePrompt.tsx
        │  invoke()
        ▼
create-checkout-session ──► Stripe Checkout ──► user pays
customer-portal-session ──► Stripe Billing Portal (manage / cancel)
                                   │
                                   ▼  (Stripe fires events)
                            stripe-webhook ──► writes `subscriptions`
                                              + stamps monthly minute limit
```

- **Stripe** bills the flat monthly price.
- **Our DB** enforces the hour cap: `instructor_usage_tracking.minutes_limit`
  is set from the tier by the webhook; `add_lecture_minutes()` counts elapsed
  lecture minutes down when a session ends (`LiveSessionControls`).
- Tier → monthly minutes lives in `supabase/functions/_shared/billing.ts`
  (`TIER_MINUTE_LIMITS`): Free 180, Starter 900, Pro 2400.

## One-time setup

### 1. Create the Stripe Products & Prices
In the Stripe dashboard (start in **Test mode**), create two recurring products:

| Product | Price | Billing period |
|---|---|---|
| Edvana Starter | $29.00 | Monthly |
| Edvana Professional | $59.00 | Monthly |

Copy each **Price ID** (`price_...`).

### 2. Seed the tiers and paste the price IDs
Run the seed, then fill in the price IDs (see the commented `UPDATE`s at the
bottom of the file):

```bash
supabase db execute --file supabase/seed_billing_tiers.sql
# then:
# update public.subscription_tiers set stripe_price_id='price_...' where name='starter';
# update public.subscription_tiers set stripe_price_id='price_...' where name='pro';
```

### 3. Set Supabase function secrets
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...   # from step 5
```
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are already
provided to edge functions by the platform.

### 4. Deploy the functions
```bash
supabase functions deploy create-checkout-session
supabase functions deploy customer-portal-session
supabase functions deploy stripe-webhook      # verify_jwt=false (set in config.toml)
```

### 5. Register the webhook endpoint in Stripe
Point a webhook at:
```
https://<project-ref>.supabase.co/functions/v1/stripe-webhook
```
Subscribe to: `checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`. Copy the signing secret (`whsec_...`) into
`STRIPE_WEBHOOK_SECRET` (step 3) and redeploy the webhook.

Enable the **Billing Portal** in Stripe (Settings → Billing → Customer portal)
so `customer-portal-session` works.

## Test the flow
1. As a free instructor, open **Settings → Billing** and upgrade to Starter.
2. Complete Stripe Checkout with test card `4242 4242 4242 4242`.
3. Confirm a row appears in `subscriptions` (status `active`) and that
   `instructor_usage_tracking.minutes_limit` for the current month is `900`.
4. End a live session and confirm `minutes_used` increments.
5. Use **Manage Billing** to open the portal and cancel — confirm the webhook
   sets status `canceled` and reverts the limit to `180`.

## Institutional tiers — Path 1 (track hours, bill overage by hand)

Institutional tiers are **annual**, **org-scoped**, sales-negotiated contracts
with a **shared hour pool per org**. Path 1 tracks usage and surfaces overage;
it does **not** auto-charge or block sessions — overage is invoiced manually at
renewal.

| Tier | Included | Price | Overage |
|---|---|---|---|
| Department | 100 hrs/yr | $1,499/yr | $15.00/hr |
| Campus | 400 hrs/yr | $3,999/yr | $10.00/hr |
| Enterprise | 1,200 hrs/yr | $7,999/yr | $6.67/hr |

**How it works**
- The org's pool lives in `usage_records` (`metric_type='video_minutes'`):
  `usage_limit` = included minutes (+ rolled-over minutes), `usage_count` =
  minutes consumed. Period = the contract year.
- `record_org_lecture_minutes()` runs at session end (via `LiveSessionControls`)
  and draws the pool down — a no-op for non-institutional orgs.
- Admins see the pool + overage estimate on the Admin Dashboard
  (`InstitutionalUsageCard`), driven by `get_org_billing_summary()`.
- **Rollover:** `provision_org_pool()` carries unused minutes into the next
  year's pool automatically.

**One-time setup**
1. Apply the SQL: `supabase db execute --file supabase/institutional_billing.sql`
   (activates the tiers and creates the functions).

**Per institutional customer (when a contract is signed)**
1. Create/record the annual base subscription (a Stripe annual Price, or invoice
   the org directly — Path 1 doesn't require self-serve checkout for these).
2. Provision their hour pool:
   ```sql
   select public.provision_org_pool('<org-uuid>', 'department'); -- or campus / enterprise
   ```
3. At renewal, re-run `provision_org_pool` (rolls over unused hours) and invoice
   any overage shown on the dashboard.

## Later: Path 2 / Path 3 (automated overage)
- **Path 2** — app-driven one-time top-up charges (Stripe invoice items at the
  tier's $/hr rate) when the pool is exceeded.
- **Path 3** — Stripe usage-based billing (Meters + Credits): grant a credit
  pool, meter every hour, let Stripe bill overage automatically. Your pricing
  already fits this (base ≈ hours × rate), so it's a clean upgrade later.
