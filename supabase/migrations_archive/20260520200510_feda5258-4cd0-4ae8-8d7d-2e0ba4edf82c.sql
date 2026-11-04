
CREATE TABLE public.live_session_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  instructor_id uuid NOT NULL,
  course_id uuid,
  org_id uuid,
  chunk_index integer NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_session_transcripts_session ON public.live_session_transcripts(session_id, chunk_index);
CREATE INDEX idx_live_session_transcripts_instructor ON public.live_session_transcripts(instructor_id);

ALTER TABLE public.live_session_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors manage own transcripts"
  ON public.live_session_transcripts
  FOR ALL
  USING (auth.uid() = instructor_id)
  WITH CHECK (auth.uid() = instructor_id);

CREATE POLICY "Enrolled students can read transcripts"
  ON public.live_session_transcripts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.instructor_students ist
      WHERE ist.student_id = auth.uid()
        AND ist.instructor_id = live_session_transcripts.instructor_id
        AND (
          live_session_transcripts.course_id IS NULL
          OR ist.course_id = live_session_transcripts.course_id
          OR ist.course_id IS NULL
        )
    )
  );

CREATE POLICY "Admins read org transcripts"
  ON public.live_session_transcripts
  FOR SELECT
  USING (
    org_id IS NOT NULL
    AND public.has_role(auth.uid(), 'admin'::app_role)
    AND org_id = public.get_user_org_id(auth.uid())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_session_transcripts;
