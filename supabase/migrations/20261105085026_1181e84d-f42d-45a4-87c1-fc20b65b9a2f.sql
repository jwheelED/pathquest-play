CREATE OR REPLACE FUNCTION public.user_joined_live_session(_session_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.live_participants WHERE session_id = _session_id AND user_id = _user_id)
$$;
REVOKE ALL ON FUNCTION public.user_joined_live_session(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_joined_live_session(uuid, uuid) TO authenticated;
DROP POLICY IF EXISTS "Students can view sessions they joined" ON public.live_sessions;
CREATE POLICY "Students can view sessions they joined" ON public.live_sessions
  FOR SELECT TO authenticated
  USING (public.user_joined_live_session(id, auth.uid()));