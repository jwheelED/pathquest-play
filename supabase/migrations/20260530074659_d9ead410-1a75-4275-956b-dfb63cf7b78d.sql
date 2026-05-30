-- 1) Restrict access to sensitive org codes (admin_code, instructor_invite_code)
-- Only service_role and the get_org_codes RPC (SECURITY DEFINER) may read them.
REVOKE SELECT (admin_code, instructor_invite_code) ON public.organizations FROM anon;
REVOKE SELECT (admin_code, instructor_invite_code) ON public.organizations FROM authenticated;
REVOKE SELECT (admin_code, instructor_invite_code) ON public.organizations FROM PUBLIC;

-- 2) Lock down public INSERT on question_send_logs
DROP POLICY IF EXISTS "System can insert logs" ON public.question_send_logs;
CREATE POLICY "Instructors can insert their own logs"
  ON public.question_send_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = instructor_id);
CREATE POLICY "Service role can insert logs"
  ON public.question_send_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 3) Lock down public INSERT on student_connection_health
DROP POLICY IF EXISTS "System can log connection health" ON public.student_connection_health;
CREATE POLICY "Instructors can log their own connection health"
  ON public.student_connection_health
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = instructor_id);
CREATE POLICY "Service role can log connection health"
  ON public.student_connection_health
  FOR INSERT
  TO service_role
  WITH CHECK (true);