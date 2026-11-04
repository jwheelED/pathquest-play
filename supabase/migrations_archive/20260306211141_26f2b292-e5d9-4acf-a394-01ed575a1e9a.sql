
CREATE TABLE public.lecture_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instructor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.live_sessions(id) ON DELETE SET NULL,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  title TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  questions_asked INTEGER NOT NULL DEFAULT 0,
  student_count INTEGER NOT NULL DEFAULT 0,
  summary_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lecture_summaries ENABLE ROW LEVEL SECURITY;

-- Instructors can manage their own summaries
CREATE POLICY "Instructors can view own summaries"
  ON public.lecture_summaries
  FOR SELECT
  TO authenticated
  USING (instructor_id = auth.uid());

CREATE POLICY "Instructors can insert own summaries"
  ON public.lecture_summaries
  FOR INSERT
  TO authenticated
  WITH CHECK (instructor_id = auth.uid());

CREATE POLICY "Instructors can delete own summaries"
  ON public.lecture_summaries
  FOR DELETE
  TO authenticated
  USING (instructor_id = auth.uid());

-- Auto-set org_id from instructor profile
CREATE OR REPLACE FUNCTION public.set_lecture_summary_org_id()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM profiles WHERE id = NEW.instructor_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_lecture_summary_org_id_trigger
  BEFORE INSERT ON public.lecture_summaries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_lecture_summary_org_id();
