-- ============================================================================
-- STAGED MIGRATION — NOT YET APPLIED. See db/proposed/README.md.
--
-- Adds FERPA reveal-eligible staff roles + a server-side reveal audit trail,
-- which unblock the inert "Reveal individual student" gate in the admin
-- Support Workflow (SupportQueueTable) and replace its localStorage-only log.
--
-- Design notes:
--  * Staff roles are kept in a SEPARATE table/enum so the core app_role enum
--    (admin | instructor | student) is untouched and additions stay reversible.
--  * Mirrors existing conventions: has_role(), get_user_org_id(), org-scoped
--    admin SELECT policies, unique(user_id, role).
-- ============================================================================

-- 1) Reveal-eligible staff roles -------------------------------------------
create type public.staff_role as enum (
  'advisor',
  'instructor_of_record',
  'support_staff'
);

create table public.user_staff_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.staff_role not null,
  created_at timestamptz default now(),
  unique (user_id, role)
);

alter table public.user_staff_roles enable row level security;

-- has_role() analogue for staff roles.
create or replace function public.has_staff_role(_user_id uuid, _role public.staff_role)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.user_staff_roles
    where user_id = _user_id and role = _role
  );
$$;

-- Convenience: does this user hold ANY reveal-eligible staff role?
create or replace function public.has_any_staff_role(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.user_staff_roles where user_id = _user_id
  );
$$;

-- RLS: users see their own staff roles; admins see staff roles for org members.
create policy "Users can view their own staff roles"
  on public.user_staff_roles for select
  using (auth.uid() = user_id);

create policy "Admins can view org member staff roles"
  on public.user_staff_roles for select
  using (
    has_role(auth.uid(), 'admin'::app_role)
    and exists (
      select 1 from public.profiles p
      where p.id = user_staff_roles.user_id
        and p.org_id = get_user_org_id(auth.uid())
    )
  );

-- NOTE: assignment of staff roles is intentionally left to a privileged/admin
-- flow. No INSERT/UPDATE/DELETE policy is granted to end users by default; add
-- one deliberately when that assignment flow is built.


-- 2) Server-side FERPA reveal audit trail ----------------------------------
-- Replaces the per-browser localStorage stub in SupportQueueTable with a real,
-- tamper-resistant record of who unmasked which student support case and when.
create table public.support_reveal_audit (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null,                                   -- the support case (student) id
  viewer_id   uuid not null references auth.users (id) on delete cascade,
  viewer_role public.staff_role not null,                      -- admins cannot reveal, so always a staff role
  revealed_at timestamptz not null default now()
);

alter table public.support_reveal_audit enable row level security;

create index support_reveal_audit_case_idx   on public.support_reveal_audit (case_id);
create index support_reveal_audit_viewer_idx on public.support_reveal_audit (viewer_id);

-- A reveal-eligible staff member may write ONLY their own reveal events.
create policy "Staff can insert their own reveal events"
  on public.support_reveal_audit for insert
  with check (
    auth.uid() = viewer_id
    and has_any_staff_role(auth.uid())
  );

-- Admins may read the audit trail; staff may read their own events.
create policy "Admins can read reveal audit"
  on public.support_reveal_audit for select
  using (has_role(auth.uid(), 'admin'::app_role));

create policy "Staff can read their own reveal events"
  on public.support_reveal_audit for select
  using (auth.uid() = viewer_id);
