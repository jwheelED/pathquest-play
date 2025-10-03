-- Add explicit SELECT-blocking policies for maximum clarity
-- These are in addition to the ALL-blocking policies we already have

-- Explicit SELECT deny for anon
DROP POLICY IF EXISTS "deny_anon_select" ON public.users;
CREATE POLICY "deny_anon_select"
  ON public.users
  AS RESTRICTIVE
  FOR SELECT
  TO anon
  USING (false);

-- Explicit SELECT deny for public
DROP POLICY IF EXISTS "deny_public_select" ON public.users;
CREATE POLICY "deny_public_select"
  ON public.users
  AS RESTRICTIVE
  FOR SELECT
  TO public
  USING (false);

-- Make absolutely certain no grants exist
REVOKE ALL ON public.users FROM anon, public CASCADE;