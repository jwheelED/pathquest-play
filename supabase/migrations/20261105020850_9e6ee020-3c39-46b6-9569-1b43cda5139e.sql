ALTER TABLE public.live_participants ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS live_participants_session_user_unique
  ON public.live_participants (session_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS live_participants_user_id_idx
  ON public.live_participants (user_id)
  WHERE user_id IS NOT NULL;

CREATE POLICY "Students can read own participant rows"
  ON public.live_participants FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Students can read own live responses"
  ON public.live_responses FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.live_participants p
    WHERE p.id = live_responses.participant_id AND p.user_id = auth.uid()
  ));