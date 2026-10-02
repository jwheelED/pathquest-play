
insert into public.subscription_tiers
  (name, display_name, description, price_cents, billing_period,
   pricing_model, price_suffix, features, is_active, sort_order,
   student_limit, course_limit)
values
  ('department', 'Department', '100 shared lecture hours per year across your department. Annual contract, unused hours roll over.',
   149900, 'year', 'flat_rate', '/year',
   '["100 shared lecture hours / year","Shared across all instructors","Unused hours roll over","Overage billed at $15/hr"]'::jsonb,
   true, 10, null, null),
  ('campus', 'Campus', '400 shared lecture hours per year with admin reporting and workflows. Annual contract, unused hours roll over.',
   399900, 'year', 'flat_rate', '/year',
   '["400 shared lecture hours / year","Admin reporting & workflows","Unused hours roll over","Overage billed at $10/hr"]'::jsonb,
   true, 11, null, null),
  ('enterprise', 'Enterprise', '1,200 shared lecture hours per year with priority support. Annual contract, unused hours roll over.',
   799900, 'year', 'flat_rate', '/year',
   '["1,200 shared lecture hours / year","Priority support & onboarding","Unused hours roll over","Overage billed at $6.67/hr"]'::jsonb,
   true, 12, null, null)
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
  updated_at    = now();
