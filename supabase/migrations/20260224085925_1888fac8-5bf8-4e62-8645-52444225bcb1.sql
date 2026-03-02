-- Allow instructors to insert into admin_instructors when accepting an invite
-- They need to create the link between themselves and the admin
CREATE POLICY "Instructors can insert own admin connection"
  ON public.admin_instructors
  FOR INSERT
  TO authenticated
  WITH CHECK (
    instructor_id = auth.uid()
    AND has_role(auth.uid(), 'instructor'::app_role)
  );

-- Ensure instructors can read their own admin connections
CREATE POLICY "Instructors can view own admin connections"
  ON public.admin_instructors
  FOR SELECT
  TO authenticated
  USING (
    instructor_id = auth.uid()
    OR admin_id = auth.uid()
  );