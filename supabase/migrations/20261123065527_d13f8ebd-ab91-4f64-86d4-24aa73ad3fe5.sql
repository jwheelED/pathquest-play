CREATE TABLE public.live_question_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL UNIQUE REFERENCES public.live_questions(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  themes jsonb NOT NULL DEFAULT '[]'::jsonb,
  response_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.live_question_themes TO authenticated;
GRANT ALL ON public.live_question_themes TO service_role;
ALTER TABLE public.live_question_themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Session instructors can view themes" ON public.live_question_themes
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.live_sessions s WHERE s.id = session_id AND s.instructor_id = auth.uid()));
CREATE TRIGGER update_live_question_themes_updated_at BEFORE UPDATE ON public.live_question_themes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_question_themes;