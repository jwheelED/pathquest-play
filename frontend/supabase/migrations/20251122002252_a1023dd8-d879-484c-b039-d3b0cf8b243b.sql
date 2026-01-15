-- Create personalized_questions table for material-based questions
CREATE TABLE public.personalized_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_material_id UUID REFERENCES public.student_study_materials(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id),
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('multiple_choice', 'short_answer', 'true_false')),
  options JSONB,
  correct_answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  topic_tags TEXT[],
  points_reward INTEGER NOT NULL DEFAULT 10,
  times_attempted INTEGER DEFAULT 0,
  times_correct INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_personalized_questions_user ON public.personalized_questions(user_id);
CREATE INDEX idx_personalized_questions_material ON public.personalized_questions(source_material_id);
CREATE INDEX idx_personalized_questions_tags ON public.personalized_questions USING GIN(topic_tags);
CREATE INDEX idx_personalized_questions_difficulty ON public.personalized_questions(difficulty);

-- Enable RLS
ALTER TABLE public.personalized_questions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own personalized questions"
ON public.personalized_questions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own personalized questions"
ON public.personalized_questions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own personalized questions"
ON public.personalized_questions FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own personalized questions"
ON public.personalized_questions FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Instructors can view student personalized questions
CREATE POLICY "Instructors can view student personalized questions"
ON public.personalized_questions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.instructor_students
    WHERE instructor_id = auth.uid() AND student_id = personalized_questions.user_id
  )
);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_personalized_questions_updated_at
BEFORE UPDATE ON public.personalized_questions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for question performance tracking
CREATE INDEX idx_personalized_questions_performance 
ON public.personalized_questions(times_attempted, times_correct);