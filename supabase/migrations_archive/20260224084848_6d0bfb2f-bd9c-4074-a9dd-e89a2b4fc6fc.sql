
-- Allow instructors to accept their own invites (update status)
CREATE POLICY "Instructors can accept own invites"
  ON public.instructor_invites
  FOR UPDATE
  TO authenticated
  USING (lower(email) = lower((auth.jwt()->>'email')::text))
  WITH CHECK (lower(email) = lower((auth.jwt()->>'email')::text));
