-- Phase 2 — real FERPA/security boundary for role-gated admin scopes.
--
-- Phase 1 (supabase/org_admin_scopes.sql) hid tabs but did NOT restrict data:
-- every admin policy was gated on the flat `admin` role, so a billing-only
-- admin could still read student grades directly. This rewrites those policies
-- to also require the matching scope:
--   academic data  -> requires 'academic' (or 'owner')
--   billing data   -> requires 'billing'  (or 'owner')
--
-- Owners satisfy both, so no current user loses access (the Phase 1 backfill
-- made every existing admin an 'owner'). Policy bodies are copied verbatim from
-- the live definitions with only the scope check AND-ed onto the admin branch.
--
-- NOT in supabase/migrations/ per repo rules. Run in a maintenance window
-- (policies are briefly dropped/recreated). Test on staging first.
--
-- Run:  supabase db execute --file supabase/academic_scope_rls.sql

begin;

-- Scope helper: true if the caller holds p_scope OR 'owner' in their org. -----
create or replace function public.has_admin_scope(p_scope text)
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
      and scope in (p_scope, 'owner')
  );
$$;
grant execute on function public.has_admin_scope(text) to authenticated;

-- ===== ACADEMIC data: require 'academic' scope on the admin branch ==========

drop policy if exists "Admins view managed instructor assignments" on public.student_assignments;
create policy "Admins view managed instructor assignments" on public.student_assignments
  for select to authenticated
  using (
    has_role(auth.uid(), 'admin'::app_role)
    and has_admin_scope('academic')
    and (exists (
      select 1 from admin_instructors
      where admin_instructors.admin_id = auth.uid()
        and admin_instructors.instructor_id = student_assignments.instructor_id))
  );

drop policy if exists "Admins can view org profiles" on public.profiles;
create policy "Admins can view org profiles" on public.profiles
  for select to authenticated
  using (
    has_role(auth.uid(), 'admin'::app_role)
    and (org_id is not null)
    and (org_id = get_user_org_id(auth.uid()))
    and has_admin_scope('academic')
  );

drop policy if exists "Admins view org courses" on public.courses;
create policy "Admins view org courses" on public.courses
  for select to public
  using (
    (org_id is not null)
    and (org_id = get_user_org_id(auth.uid()))
    and has_role(auth.uid(), 'admin'::app_role)
    and has_admin_scope('academic')
  );

drop policy if exists "Admins read org transcripts" on public.live_session_transcripts;
create policy "Admins read org transcripts" on public.live_session_transcripts
  for select to public
  using (
    (org_id is not null)
    and has_role(auth.uid(), 'admin'::app_role)
    and (org_id = get_user_org_id(auth.uid()))
    and has_admin_scope('academic')
  );

drop policy if exists "Org-scoped lesson progress access" on public.lesson_progress;
create policy "Org-scoped lesson progress access" on public.lesson_progress
  for all to authenticated
  using (
    (org_id = get_user_org_id(auth.uid()))
    and (
      (auth.uid() = user_id)
      or (has_role(auth.uid(), 'admin'::app_role) and has_admin_scope('academic'))
      or (has_role(auth.uid(), 'instructor'::app_role) and (exists (
        select 1 from instructor_students
        where instructor_students.instructor_id = auth.uid()
          and instructor_students.student_id = lesson_progress.user_id)))
    )
  )
  with check ((org_id = get_user_org_id(auth.uid())) and (auth.uid() = user_id));

drop policy if exists "Org-scoped user stats access" on public.user_stats;
create policy "Org-scoped user stats access" on public.user_stats
  for all to authenticated
  using (
    (org_id = get_user_org_id(auth.uid()))
    and (
      (auth.uid() = user_id)
      or (has_role(auth.uid(), 'admin'::app_role) and has_admin_scope('academic'))
      or (has_role(auth.uid(), 'instructor'::app_role) and (exists (
        select 1 from instructor_students
        where instructor_students.instructor_id = auth.uid()
          and instructor_students.student_id = user_stats.user_id)))
    )
  )
  with check ((org_id = get_user_org_id(auth.uid())) and (auth.uid() = user_id));

drop policy if exists "Org-scoped achievements access" on public.user_achievements;
create policy "Org-scoped achievements access" on public.user_achievements
  for all to authenticated
  using (
    (org_id = get_user_org_id(auth.uid()))
    and (
      (auth.uid() = user_id)
      or (has_role(auth.uid(), 'admin'::app_role) and has_admin_scope('academic'))
      or (has_role(auth.uid(), 'instructor'::app_role) and (exists (
        select 1 from instructor_students
        where instructor_students.instructor_id = auth.uid()
          and instructor_students.student_id = user_achievements.user_id)))
    )
  )
  with check ((org_id = get_user_org_id(auth.uid())) and (auth.uid() = user_id));

drop policy if exists "Org-scoped messages access" on public.messages;
create policy "Org-scoped messages access" on public.messages
  for all to authenticated
  using (
    (org_id = get_user_org_id(auth.uid()))
    and (
      (auth.uid() = sender_id)
      or (auth.uid() = recipient_id)
      or (has_role(auth.uid(), 'admin'::app_role) and has_admin_scope('academic'))
    )
  )
  with check ((org_id = get_user_org_id(auth.uid())) and (auth.uid() = sender_id));

-- ===== BILLING data: require 'billing' scope on the admin branch ============
-- (App billing surfaces use SECURITY DEFINER RPCs that bypass RLS, so this only
--  restricts direct table access — an academic-only admin can't read billing.)

drop policy if exists "Admins can manage org subscriptions" on public.subscriptions;
create policy "Admins can manage org subscriptions" on public.subscriptions
  for all to public
  using (has_role(auth.uid(), 'admin'::app_role) and (org_id = get_user_org_id(auth.uid())) and has_admin_scope('billing'))
  with check (has_role(auth.uid(), 'admin'::app_role) and (org_id = get_user_org_id(auth.uid())) and has_admin_scope('billing'));

drop policy if exists "Admins can manage org usage" on public.usage_records;
create policy "Admins can manage org usage" on public.usage_records
  for all to public
  using (has_role(auth.uid(), 'admin'::app_role) and (org_id = get_user_org_id(auth.uid())) and has_admin_scope('billing'))
  with check (has_role(auth.uid(), 'admin'::app_role) and (org_id = get_user_org_id(auth.uid())) and has_admin_scope('billing'));

drop policy if exists "Admins can view org usage" on public.usage_records;
create policy "Admins can view org usage" on public.usage_records
  for select to public
  using (has_role(auth.uid(), 'admin'::app_role) and (org_id = get_user_org_id(auth.uid())) and has_admin_scope('billing'));

drop policy if exists "Admins view org usage" on public.instructor_usage_tracking;
create policy "Admins view org usage" on public.instructor_usage_tracking
  for select to public
  using (has_role(auth.uid(), 'admin'::app_role) and (org_id = get_user_org_id(auth.uid())) and has_admin_scope('billing'));

commit;
