-- Fix 1: Alter default privileges to prevent anon access to future tables
-- This prevents the anon role from getting automatic grants on new tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
REVOKE ALL ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
REVOKE ALL ON TABLES FROM public;

-- Fix 2: Ensure the users table has minimal grants
-- Keep only what's needed for authenticated users (select, insert)
-- RLS policies will further restrict what they can actually see
REVOKE ALL ON public.users FROM authenticated;
GRANT SELECT, INSERT ON public.users TO authenticated;

-- Fix 3: Verify no other roles have been granted access
-- Remove any grants to anon or public that might have slipped through
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, public;

-- Note: RLS FORCE is already enabled, and we have explicit RESTRICTIVE deny policies
-- This ensures defense-in-depth: no grants + RLS + explicit denies = completely secure