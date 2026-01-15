-- Add explicit DENY policy for anonymous users
-- This makes it absolutely clear that anon users cannot access the users table
CREATE POLICY "deny_anon_all_access"
  ON public.users
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false);

-- Also add restrictive policy for public role
CREATE POLICY "deny_public_all_access"
  ON public.users
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (false);