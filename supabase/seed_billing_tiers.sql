-- Seed / re-seed the instructor subscription tiers to match the Edvana pricing
-- model (monthly, hours-based). Run this against your Supabase project AFTER
-- creating the matching Products/Prices in Stripe, then paste the price IDs in
-- the UPDATE block at the bottom.
--
--   Free     3 hrs/month    $0     no card, resets monthly
--   Starter  15 hrs/month   $29    resets monthly, no rollover
--   Pro      40 hrs/month   $59    resets monthly, no rollover
--
-- This is DATA only (no schema change) so it lives outside supabase/migrations/.
-- The monthly minute allowance per tier is enforced in code — see
-- supabase/functions/_shared/billing.ts (TIER_MINUTE_LIMITS).
--
-- Run:  supabase db execute --file supabase/seed_billing_tiers.sql
--   or paste into the Supabase SQL editor.

begin;

-- Retire any tiers from the previous pricing model without deleting them
-- (existing subscriptions may still FK-reference their rows).
update public.subscription_tiers
set is_active = false, updated_at = now()
where name not in ('free', 'starter', 'pro');

insert into public.subscription_tiers
  (name, display_name, description, price_cents, billing_period,
   pricing_model, price_suffix, features, is_active, sort_order,
   student_limit, course_limit)
values
  ('free', 'Free', '3 hours of live lecture time per month. No credit card required. Resets monthly.',
   0, 'month', 'flat_rate', '/month',
   '["AI-generated check-ins","No credit card required"]'::jsonb,
   true, 0, null, 1),

  ('starter', 'Starter', '15 hours of live lecture time per month. 1 course, 1-2 sessions/week. No contract.',
   2900, 'month', 'flat_rate', '/month',
   '["15 hours of lecture time / month","Unlimited students","1 course","Full AI question suite"]'::jsonb,
   true, 1, null, 1),

  ('pro', 'Professional', '40 hours of live lecture time per month. Multiple courses, full schedule. No contract.',
   5900, 'month', 'flat_rate', '/month',
   '["40 hours of lecture time / month","Unlimited students","Unlimited courses","Priority support","Advanced analytics"]'::jsonb,
   true, 2, null, null)

on conflict (name) do update set
  display_name  = excluded.display_name,
  description   = excluded.description,
  price_cents   = excluded.price_cents,
  billing_period = excluded.billing_period,
  pricing_model = excluded.pricing_model,
  price_suffix  = excluded.price_suffix,
  features      = excluded.features,
  is_active     = excluded.is_active,
  sort_order    = excluded.sort_order,
  student_limit = excluded.student_limit,
  course_limit  = excluded.course_limit,
  updated_at    = now();

-- ---------------------------------------------------------------------------
-- Stripe Price IDs (test mode). Checkout rejects a paid tier whose
-- stripe_price_id is NULL. Replace with live-mode IDs when going to production.
-- ---------------------------------------------------------------------------
update public.subscription_tiers set stripe_price_id = 'price_1TpeXuL88sjmY9hiUbmSMBqj' where name = 'starter'; -- Edvana Starter $29/mo
update public.subscription_tiers set stripe_price_id = 'price_1TpeXvL88sjmY9hitMUGu0KO' where name = 'pro';     -- Edvana Professional $59/mo

commit;
