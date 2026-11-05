DROP POLICY IF EXISTS "Students can view sessions they joined" ON public.live_sessions;
DROP FUNCTION IF EXISTS public.user_joined_live_session(uuid, uuid);
CREATE OR REPLACE FUNCTION public.current_user_joined_live_session(_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.live_participants WHERE session_id = _session_id AND user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.current_user_joined_live_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_joined_live_session(uuid) TO authenticated;
CREATE POLICY "Students can view sessions they joined" ON public.live_sessions
  FOR SELECT TO authenticated
  USING (public.current_user_joined_live_session(id));