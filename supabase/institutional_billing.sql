-- Institutional billing — Path 1 (track hours, bill overage by hand).
--
-- Institutional tiers are annual, org-scoped, sales-negotiated contracts:
--
--   Department  100 hrs/yr   $1,499/yr   overage $15.00/hr
--   Campus      400 hrs/yr   $3,999/yr   overage $10.00/hr
--   Enterprise  1,200 hrs/yr $7,999/yr   overage  $6.67/hr
--
-- The org's included-hour pool lives in `usage_records` (metric_type =
-- 'video_minutes'). Sessions draw the pool down; going over is NOT blocked —
-- it's surfaced in the admin UI and billed manually at renewal. Unused hours
-- roll over into the next year's pool.
--
-- DATA + FUNCTIONS only (no schema change) so it lives outside migrations/.
-- Run:  supabase db execute --file supabase/institutional_billing.sql
--   or paste into the Supabase SQL editor.
--
-- Keep the hour numbers in sync with src/lib/billingConfig.ts INSTITUTIONAL_TIERS.

begin;

-- 1) Activate the institutional tiers (annual). ------------------------------
insert into public.subscription_tiers
  (name, display_name, description, price_cents, billing_period,
   pricing_model, price_suffix, features, is_active, sort_order,
   student_limit, course_limit)
values
  ('department', 'Department', '100 shared session hours per year for a single department. Annual contract with rollover — top up at renewal, not mid-year.',
   149900, 'year', 'flat_rate', '/year',
   '["100 shared session hours / year","Shared across all instructors in the department","Usage dashboard & admin reporting","Unused hours roll over to next year"]'::jsonb,
   true, 10, null, null),

  ('campus', 'Campus', '400 shared session hours per year across your campus, with advanced admin workflows. Annual contract with rollover.',
   399900, 'year', 'flat_rate', '/year',
   '["400 shared session hours / year","Shared across all instructors on campus","Advanced admin workflows & role management","Usage dashboard & admin reporting","Unused hours roll over to next year"]'::jsonb,
   true, 11, null, null),

  ('enterprise', 'Enterprise', '1,200 shared session hours per year with priority support and onboarding. Annual contract with rollover.',
   799900, 'year', 'flat_rate', '/year',
   '["1,200 shared session hours / year","Shared across your entire organization","Priority support & dedicated onboarding","Advanced admin workflows & reporting","Unused hours roll over to next year"]'::jsonb,
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

-- Included minutes per institutional tier (hours * 60).
create or replace function public.institutional_included_minutes(p_tier_name text)
returns integer
language sql
immutable
set search_path to 'public'
as $$
  select case p_tier_name
    when 'department' then 6000    -- 100 hrs
    when 'campus'     then 24000   -- 400 hrs
    when 'enterprise' then 72000   -- 1,200 hrs
    else null
  end;
$$;

-- 2) Provision (or renew) an org's annual hour pool. -------------------------
-- Run this when a contract is signed / renewed:
--   select public.provision_org_pool('<org-uuid>', 'department');
-- Rollover: unused minutes from the org's most recent pool are carried forward.
create or replace function public.provision_org_pool(p_org_id uuid, p_tier_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_base integer;
  v_leftover integer := 0;
  v_prev record;
begin
  v_base := public.institutional_included_minutes(p_tier_name);
  if v_base is null then
    raise exception 'Unknown institutional tier: %', p_tier_name;
  end if;

  select usage_limit, usage_count into v_prev
  from usage_records
  where org_id = p_org_id and metric_type = 'video_minutes'
  order by period_end desc
  limit 1;

  if found then
    v_leftover := greatest(0, coalesce(v_prev.usage_limit, 0) - coalesce(v_prev.usage_count, 0));
  end if;

  insert into usage_records
    (org_id, period_start, period_end, metric_type, usage_count, usage_limit)
  values
    (p_org_id, now(), now() + interval '1 year', 'video_minutes', 0, v_base + v_leftover);
end;
$$;

-- 3) Record consumed minutes against an org's current pool. ------------------
-- Called at session end. No-op if the instructor has no org, or the org has no
-- active pool (i.e. it's not an institutional customer).
create or replace function public.record_org_lecture_minutes(p_instructor_id uuid, p_minutes integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from profiles where id = p_instructor_id;
  if v_org is null then
    return;
  end if;

  update usage_records
  set usage_count = usage_count + p_minutes,
      updated_at = now()
  where org_id = v_org
    and metric_type = 'video_minutes'
    and now() >= period_start
    and now() <= period_end;
end;
$$;

-- 4) Billing summary for the caller's org (drives the admin usage card). -----
-- Resolves the org from the authenticated user, so it only ever returns the
-- caller's own org numbers.
create or replace function public.get_org_billing_summary()
returns table (
  has_plan boolean,
  tier_name text,
  tier_display text,
  annual_price_cents integer,
  included_minutes integer,
  used_minutes integer,
  period_end timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from profiles where id = auth.uid();

  if v_org is null then
    return query select false, null::text, null::text, null::integer, null::integer, 0, null::timestamptz;
    return;
  end if;

  return query
    select
      true,
      t.name,
      t.display_name,
      t.price_cents,
      ur.usage_limit,
      coalesce(ur.usage_count, 0),
      ur.period_end
    from usage_records ur
    left join subscriptions s
      on s.org_id = v_org and s.status = 'active'
    left join subscription_tiers t
      on t.id = s.tier_id
    where ur.org_id = v_org
      and ur.metric_type = 'video_minutes'
      and now() >= ur.period_start
      and now() <= ur.period_end
    order by ur.period_end desc
    limit 1;

  if not found then
    return query select false, null::text, null::text, null::integer, null::integer, 0, null::timestamptz;
  end if;
end;
$$;

grant execute on function public.record_org_lecture_minutes(uuid, integer) to authenticated;
grant execute on function public.get_org_billing_summary() to authenticated;

commit;
