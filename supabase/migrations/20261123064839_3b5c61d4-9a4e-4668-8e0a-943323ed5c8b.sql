DROP POLICY IF EXISTS "Service role can manage cache" ON public.ai_explanation_cache;
DROP POLICY IF EXISTS "Anyone can read cached explanations" ON public.ai_explanation_cache;

CREATE OR REPLACE FUNCTION public.is_live_participant_of_session(_participant_id uuid, _session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.live_participants p
    JOIN public.live_sessions s ON s.id = p.session_id
    WHERE p.id = _participant_id AND p.session_id = _session_id AND s.is_active = true
  )
$$;

DROP POLICY IF EXISTS "Participants can insert confusion signals" ON public.live_confusion_signals;
CREATE POLICY "Participants can insert confusion signals" ON public.live_confusion_signals
FOR INSERT TO anon, authenticated
WITH CHECK (public.is_live_participant_of_session(participant_id, session_id));