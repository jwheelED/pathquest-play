-- Phase 1: Memory Model - Student Concept Mastery and Error Patterns

-- Per-learner concept mastery tracking
CREATE TABLE public.student_concept_mastery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  concept_name TEXT NOT NULL,
  mastery_level TEXT DEFAULT 'unknown', -- unknown, weak, shaky, mastered
  strength_score DECIMAL(3,2) DEFAULT 0.50, -- 0.00 to 1.00
  total_attempts INTEGER DEFAULT 0,
  correct_attempts INTEGER DEFAULT 0,
  last_practiced_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ, -- For spaced repetition
  decay_factor DECIMAL(3,2) DEFAULT 2.50, -- SM-2 easiness factor
  error_patterns JSONB DEFAULT '[]'::jsonb, -- ["confused_with:X", "reversed_causality"]
  performance_by_type JSONB DEFAULT '{"recall": {"attempts": 0, "correct": 0}, "application": {"attempts": 0, "correct": 0}, "reasoning": {"attempts": 0, "correct": 0}}'::jsonb,
  related_lectures UUID[] DEFAULT '{}',
  org_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, concept_name)
);

-- Error type taxonomy for detailed tracking  
CREATE TABLE public.student_error_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  error_type TEXT NOT NULL, -- confusion_between, reversed_causality, incomplete_understanding, overgeneralization
  concept_a TEXT NOT NULL,
  concept_b TEXT, -- For confusion errors
  occurrence_count INTEGER DEFAULT 1,
  last_occurred_at TIMESTAMPTZ DEFAULT now(),
  resolved BOOLEAN DEFAULT false,
  resolution_method TEXT, -- remediation, practice, review
  org_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_concept_mastery_student ON public.student_concept_mastery(student_id);
CREATE INDEX idx_concept_mastery_review ON public.student_concept_mastery(student_id, next_review_at);
CREATE INDEX idx_error_patterns_student ON public.student_error_patterns(student_id);

-- Enable RLS
ALTER TABLE public.student_concept_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_error_patterns ENABLE ROW LEVEL SECURITY;

-- RLS Policies for student_concept_mastery
CREATE POLICY "Users can manage their own concept mastery"
ON public.student_concept_mastery
FOR ALL
USING (auth.uid() = student_id)
WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Instructors can view their students concept mastery"
ON public.student_concept_mastery
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.instructor_students
  WHERE instructor_students.instructor_id = auth.uid()
  AND instructor_students.student_id = student_concept_mastery.student_id
));

-- RLS Policies for student_error_patterns
CREATE POLICY "Users can manage their own error patterns"
ON public.student_error_patterns
FOR ALL
USING (auth.uid() = student_id)
WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Instructors can view their students error patterns"
ON public.student_error_patterns
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.instructor_students
  WHERE instructor_students.instructor_id = auth.uid()
  AND instructor_students.student_id = student_error_patterns.student_id
));

-- Trigger to update updated_at
CREATE TRIGGER update_concept_mastery_updated_at
  BEFORE UPDATE ON public.student_concept_mastery
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();