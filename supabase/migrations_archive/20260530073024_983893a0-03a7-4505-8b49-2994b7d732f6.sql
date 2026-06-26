
-- 1. grade_sync_log: restrict INSERT to service_role only
DROP POLICY IF EXISTS "System can insert grade sync logs" ON public.grade_sync_log;
CREATE POLICY "Service role can insert grade sync logs"
ON public.grade_sync_log
FOR INSERT
TO service_role
WITH CHECK (true);

-- 2. live_participants: remove overly-permissive policies
DROP POLICY IF EXISTS "Anon can view participants" ON public.live_participants;
DROP POLICY IF EXISTS "Participants view own data" ON public.live_participants;
DROP POLICY IF EXISTS "Anyone can join session" ON public.live_participants;
DROP POLICY IF EXISTS "Update last seen" ON public.live_participants;
-- Restrict UPDATE to service_role (edge functions handle last-seen updates)
CREATE POLICY "Service role updates participants"
ON public.live_participants
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- 3. live_responses: remove overly-permissive policies
DROP POLICY IF EXISTS "Anon can view responses" ON public.live_responses;
DROP POLICY IF EXISTS "View own responses" ON public.live_responses;
DROP POLICY IF EXISTS "Submit responses" ON public.live_responses;

-- 4. lti_token_cache: restrict to service_role only
DROP POLICY IF EXISTS "Service role manages token cache" ON public.lti_token_cache;
CREATE POLICY "Service role manages token cache"
ON public.lti_token_cache
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
REVOKE ALL ON public.lti_token_cache FROM anon, authenticated;
GRANT ALL ON public.lti_token_cache TO service_role;

-- 5. organizations: hide secret invite/admin codes via column-level grants
REVOKE SELECT ON public.organizations FROM authenticated, anon;
GRANT SELECT (id, name, slug, created_at, updated_at) ON public.organizations TO authenticated;
-- Admins need full row access including codes; create a SECURITY DEFINER RPC for them
CREATE OR REPLACE FUNCTION public.get_org_codes(_org_id uuid)
RETURNS TABLE(admin_code text, instructor_invite_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.admin_code, o.instructor_invite_code
  FROM public.organizations o
  WHERE o.id = _org_id
    AND public.has_role(auth.uid(), 'admin'::app_role)
    AND o.id = public.get_user_org_id(auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.get_org_codes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_codes(uuid) TO authenticated;

-- 6. storage: remove public read on student-materials
DROP POLICY IF EXISTS "Public read access for student materials" ON storage.objects;

-- 7. storage: tighten lecture-videos read access to owner-instructor and enrolled students
DROP POLICY IF EXISTS "Authenticated users can read lecture videos" ON storage.objects;
CREATE POLICY "Owner instructors and enrolled students read lecture videos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'lecture-videos'::text
  AND (
    -- owner instructor (folder = uid)
    (storage.foldername(name))[1] = (auth.uid())::text
    OR
    -- enrolled students of that instructor
    EXISTS (
      SELECT 1 FROM public.instructor_students ist
      WHERE ist.student_id = auth.uid()
        AND ist.instructor_id::text = (storage.foldername(name))[1]
    )
  )
);
