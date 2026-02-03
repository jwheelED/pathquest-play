-- Create instructor_question_bank table for pre-created questions
CREATE TABLE public.instructor_question_bank (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instructor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('multiple_choice', 'short_answer', 'coding', 'coding_simple')),
  question_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT '{}',
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX idx_question_bank_instructor ON public.instructor_question_bank(instructor_id);
CREATE INDEX idx_question_bank_course ON public.instructor_question_bank(course_id);
CREATE INDEX idx_question_bank_type ON public.instructor_question_bank(question_type);
CREATE INDEX idx_question_bank_tags ON public.instructor_question_bank USING GIN(tags);
CREATE INDEX idx_question_bank_org ON public.instructor_question_bank(org_id);

-- Enable RLS
ALTER TABLE public.instructor_question_bank ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Instructors can manage their own questions
CREATE POLICY "Instructors can view their own questions"
ON public.instructor_question_bank
FOR SELECT
USING (auth.uid() = instructor_id);

CREATE POLICY "Instructors can create their own questions"
ON public.instructor_question_bank
FOR INSERT
WITH CHECK (auth.uid() = instructor_id);

CREATE POLICY "Instructors can update their own questions"
ON public.instructor_question_bank
FOR UPDATE
USING (auth.uid() = instructor_id);

CREATE POLICY "Instructors can delete their own questions"
ON public.instructor_question_bank
FOR DELETE
USING (auth.uid() = instructor_id);

-- Trigger to auto-set org_id from instructor's profile
CREATE OR REPLACE FUNCTION public.set_question_bank_org_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM profiles WHERE id = NEW.instructor_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_question_bank_org_id_trigger
BEFORE INSERT ON public.instructor_question_bank
FOR EACH ROW
EXECUTE FUNCTION public.set_question_bank_org_id();

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_question_bank_updated_at
BEFORE UPDATE ON public.instructor_question_bank
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();