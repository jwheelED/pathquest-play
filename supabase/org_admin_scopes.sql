-- Org admin scopes — role-gated admin dashboard (owner / billing / academic).
--
-- One org still has the flat `admin` app_role for every admin (that's what
-- passes ProtectedRoute). This adds an ORTHOGONAL "scope" per admin that
-- decides which dashboard tabs they see:
--
--   owner     -> sees everything (billing + academic) and can assign scopes
--   billing   -> Billing & Usage tab only  (IT / procurement)
--   academic  -> Academic Analytics tabs   (dean / chair)
--
-- PHASE 1 is UX gating only. It does NOT restrict data at the DB level — a
-- billing admin still holds `admin` and could query student data directly
-- until the Phase 2 RLS rewrite (supabase/academic_scope_rls.sql) lands.
--
-- Mirrors the standalone-SQL + SECURITY DEFINER + grant style of
-- supabase/institutional_billing.sql. This one DOES create a table (schema
-- change), so it still lives outside supabase/migrations/ per repo rules and is
-- run manually.
--
-- Run:  supabase db execute --file supabase/org_admin_scopes.sql
--   or paste into the Supabase SQL editor.

begin;

-- 1) Scope table -------------------------------------------------------------
create table if not exists public.org_admin_scopes (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  scope      text not null check (scope in ('owner', 'billing', 'academic')),
  created_at timestamptz default now() not null,
  unique (user_id, org_id, scope)
);

alter table public.org_admin_scopes enable row level security;

-- 2) Owner check helper (SECURITY DEFINER so RLS policies can call it without
--    recursing on org_admin_scopes) ----------------------------------------
create or replace function public.is_org_owner()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from org_admin_scopes
    where user_id = auth.uid()
      and org_id = get_user_org_id(auth.uid())
      and scope = 'owner'
  );
$$;

-- 3) RLS: any org admin may READ their org's scope rows (drives the management
--    card); only owners may WRITE (backstop behind set_org_admin_scopes) -----
drop policy if exists "Org admins read scopes" on public.org_admin_scopes;
create policy "Org admins read scopes" on public.org_admin_scopes
  for select to authenticated
  using (
    has_role(auth.uid(), 'admin')
    and org_id = get_user_org_id(auth.uid())
  );

drop policy if exists "Owners manage scopes" on public.org_admin_scopes;
create policy "Owners manage scopes" on public.org_admin_scopes
  for all to authenticated
  using (org_id = get_user_org_id(auth.uid()) and public.is_org_owner())
  with check (org_id = get_user_org_id(auth.uid()) and public.is_org_owner());

-- 4) Read own scopes (drives dashboard tab gating) --------------------------
create or replace function public.get_my_org_admin_scopes()
returns table (scope text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from profiles where id = auth.uid();
  if v_org is null then
    return;
  end if;
  return query
    select s.scope from org_admin_scopes s
    where s.user_id = auth.uid() and s.org_id = v_org;
end;
$$;

-- 5) List the org's admins + their scopes (drives the owner-only card) -------
create or replace function public.list_org_admins_with_scopes()
returns table (user_id uuid, full_name text, scope text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from profiles where id = auth.uid();
  if v_org is null then
    return;
  end if;
  return query
    select p.id, p.full_name, s.scope
    from profiles p
    join user_roles ur on ur.user_id = p.id and ur.role = 'admin'
    left join org_admin_scopes s on s.user_id = p.id and s.org_id = v_org
    where p.org_id = v_org
    order by p.full_name nulls last;
end;
$$;

-- 6) Owner-only writer: replace a target admin's scopes ---------------------
create or replace function public.set_org_admin_scopes(p_target_user uuid, p_scopes text[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
  v_scope text;
begin
  select org_id into v_org from profiles where id = auth.uid();
  if v_org is null then
    raise exception 'Caller has no organization';
  end if;

  -- Caller must be an owner of this org.
  if not exists (
    select 1 from org_admin_scopes
    where user_id = auth.uid() and org_id = v_org and scope = 'owner'
  ) then
    raise exception 'Only an org owner can assign admin scopes';
  end if;

  -- Target must be an admin in the same org.
  if not (
    (select org_id from profiles where id = p_target_user) = v_org
    and has_role(p_target_user, 'admin')
  ) then
    raise exception 'Target must be an admin in your organization';
  end if;

  -- Validate scope values.
  foreach v_scope in array p_scopes loop
    if v_scope not in ('owner', 'billing', 'academic') then
      raise exception 'Invalid scope: %', v_scope;
    end if;
  end loop;

  -- Replace the target's scope set.
  delete from org_admin_scopes where user_id = p_target_user and org_id = v_org;
  insert into org_admin_scopes (user_id, org_id, scope)
    select p_target_user, v_org, unnest(p_scopes)
  on conflict (user_id, org_id, scope) do nothing;
end;
$$;

-- 7) Seed a default scope for the caller after they join/create an org ------
--    First admin in an org bootstraps to 'owner'; later joiners -> 'academic'.
create or replace function public.ensure_default_admin_scope()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
  v_org_has_scopes boolean;
  v_self_has_scopes boolean;
begin
  select org_id into v_org from profiles where id = auth.uid();
  if v_org is null then
    return;
  end if;

  select exists (select 1 from org_admin_scopes where user_id = auth.uid() and org_id = v_org)
    into v_self_has_scopes;
  if v_self_has_scopes then
    return; -- already assigned; leave as-is
  end if;

  select exists (select 1 from org_admin_scopes where org_id = v_org)
    into v_org_has_scopes;

  insert into org_admin_scopes (user_id, org_id, scope)
  values (auth.uid(), v_org, case when v_org_has_scopes then 'academic' else 'owner' end)
  on conflict (user_id, org_id, scope) do nothing;
end;
$$;

grant execute on function public.get_my_org_admin_scopes() to authenticated;
grant execute on function public.list_org_admins_with_scopes() to authenticated;
grant execute on function public.set_org_admin_scopes(uuid, text[]) to authenticated;
grant execute on function public.ensure_default_admin_scope() to authenticated;

-- 8) BACKFILL (anti-lockout): every current org admin becomes an 'owner' so no
--    existing admin loses tabs on deploy. Idempotent. Verify the row count
--    equals your admin count afterward.
insert into public.org_admin_scopes (user_id, org_id, scope)
  select ur.user_id, p.org_id, 'owner'
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.role = 'admin' and p.org_id is not null
on conflict (user_id, org_id, scope) do nothing;

commit;
