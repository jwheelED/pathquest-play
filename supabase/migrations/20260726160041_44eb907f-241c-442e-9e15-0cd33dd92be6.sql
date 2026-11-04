-- 1) Organizations: strip secret columns from member-readable access
REVOKE SELECT ON public.organizations FROM anon, authenticated;
GRANT SELECT (id, name, slug, created_at, updated_at) ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

DROP POLICY IF EXISTS "Users can view their own organization" ON public.organizations;
CREATE POLICY "Members can view their own organization"
ON public.organizations
FOR SELECT
TO authenticated
USING (id = public.get_user_org_id(auth.uid()));

-- 2) rate_limits: no DELETE / unrestricted UPDATE for users
DROP POLICY IF EXISTS "Users can manage own rate limits" ON public.rate_limits;

CREATE POLICY "Users can view own rate limits"
ON public.rate_limits
FOR SELECT
TO authenticated
USING (
  key LIKE ('question_detection:' || auth.uid()::text || '%')
  OR key LIKE ('question_sending:' || auth.uid()::text || '%')
);

CREATE POLICY "Users can insert own rate limits"
ON public.rate_limits
FOR INSERT
TO authenticated
WITH CHECK (
  key LIKE ('question_detection:' || auth.uid()::text || '%')
  OR key LIKE ('question_sending:' || auth.uid()::text || '%')
);

CREATE POLICY "Service role manages rate limits"
ON public.rate_limits
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE UPDATE, DELETE ON public.rate_limits FROM authenticated, anon;
GRANT SELECT, INSERT ON public.rate_limits TO authenticated;
GRANT ALL ON public.rate_limits TO service_role;