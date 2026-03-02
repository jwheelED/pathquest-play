
-- Fix: Replace the instructor_invites SELECT policy that references auth.users with ambiguous alias
DROP POLICY IF EXISTS "Users can check own invites" ON public.instructor_invites;
CREATE POLICY "Users can check own invites"
  ON public.instructor_invites
  FOR SELECT
  TO authenticated
  USING (
    lower(email) = lower((auth.jwt()->>'email')::text)
    OR (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  );

-- Fix: Allow admins to INSERT organizations
CREATE POLICY "Admins can create organizations"
  ON public.organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
