-- Remove the restrictive policies that are blocking authenticated users
-- The public role in Postgres includes authenticated users, so these restrictive
-- policies are blocking legitimate access

DROP POLICY IF EXISTS "deny_public_all_access" ON public.users;
DROP POLICY IF EXISTS "deny_public_select" ON public.users;

-- Keep the anon restrictions but they should not affect authenticated users
-- since anon and authenticated are separate roles