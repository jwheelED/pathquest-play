-- Create lecture_questions table for storing generated questions from lectures
CREATE TABLE IF NOT EXISTS public.lecture_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transcript_snippet text NOT NULL,
  questions jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lecture_questions ENABLE ROW LEVEL SECURITY;

-- Instructors can manage their own lecture questions
CREATE POLICY "Instructors manage their lecture questions"
  ON public.lecture_questions
  FOR ALL
  USING (auth.uid() = instructor_id)
  WITH CHECK (auth.uid() = instructor_id);

-- Add course-related fields to profiles for instructors
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS course_title text,
ADD COLUMN IF NOT EXISTS course_schedule text,
ADD COLUMN IF NOT EXISTS course_topics text[];

-- Create answer_version_history table for tracking student work
CREATE TABLE IF NOT EXISTS public.answer_version_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.student_assignments(id) ON DELETE CASCADE,
  version_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  typed_count integer NOT NULL DEFAULT 0,
  pasted_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.answer_version_history ENABLE ROW LEVEL SECURITY;

-- Students can manage their own version history
CREATE POLICY "Students manage their version history"
  ON public.answer_version_history
  FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- Instructors can view their students' version history
CREATE POLICY "Instructors view student version history"
  ON public.answer_version_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_assignments sa
      WHERE sa.id = answer_version_history.assignment_id
      AND sa.instructor_id = auth.uid()
    )
  );

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_lecture_questions_instructor 
  ON public.lecture_questions(instructor_id, status);

CREATE INDEX IF NOT EXISTS idx_answer_version_history_assignment 
  ON public.answer_version_history(assignment_id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_lecture_questions_updated_at
  BEFORE UPDATE ON public.lecture_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_answer_version_history_updated_at
  BEFORE UPDATE ON public.answer_version_history
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();