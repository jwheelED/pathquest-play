CREATE POLICY "Students can view sessions they joined"
  ON public.live_sessions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.live_participants p
    WHERE p.session_id = live_sessions.id AND p.user_id = auth.uid()
  ));