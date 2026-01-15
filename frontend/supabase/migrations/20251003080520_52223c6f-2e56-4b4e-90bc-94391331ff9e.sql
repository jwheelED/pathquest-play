-- Absolutely ensure no anonymous or public access to users table
-- First, revoke all possible grants from anon and public
REVOKE ALL PRIVILEGES ON public.users FROM anon, public;

-- Force RLS (makes even table owner subject to RLS)
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

-- Verify RLS is properly configured
-- The table should now be completely inaccessible to anon/public roles
-- Only authenticated users with matching policies can access their own data or instructor-student relationships