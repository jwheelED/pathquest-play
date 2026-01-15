-- ===========================================
-- ANSWER KEY INTEGRATION - Phase 1: Database Schema
-- ===========================================

-- Table: instructor_answer_keys
-- Stores uploaded answer key documents
CREATE TABLE public.instructor_answer_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id),
  title TEXT NOT NULL,
  subject TEXT NOT NULL, -- 'physics', 'engineering', 'chemistry', 'mathematics', etc.
  course_context TEXT, -- e.g., "PHYS 201 - Mechanics"
  file_path TEXT, -- original uploaded file in storage
  file_name TEXT,
  file_type TEXT,
  status TEXT NOT NULL DEFAULT 'processing', -- 'processing', 'parsed', 'verified', 'error'
  problem_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: answer_key_problems
-- Individual problem-solution pairs extracted from answer keys
CREATE TABLE public.answer_key_problems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_key_id UUID NOT NULL REFERENCES public.instructor_answer_keys(id) ON DELETE CASCADE,
  problem_number TEXT, -- "1a", "2.3", etc.
  problem_text TEXT NOT NULL,
  problem_latex TEXT, -- LaTeX version for complex equations
  solution_text TEXT NOT NULL,
  solution_latex TEXT,
  solution_steps JSONB DEFAULT '[]'::jsonb, -- step-by-step breakdown [{step, explanation, latex}]
  final_answer TEXT NOT NULL, -- the definitive answer
  final_answer_latex TEXT,
  units TEXT, -- "m/s", "J", "N", etc.
  topic_tags TEXT[] DEFAULT '{}', -- ['kinematics', 'projectile-motion']
  keywords TEXT[] DEFAULT '{}', -- trigger words for transcript matching
  difficulty TEXT DEFAULT 'intermediate', -- 'beginner', 'intermediate', 'advanced', 'expert'
  verified_by_instructor BOOLEAN DEFAULT false,
  verification_notes TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: answer_key_mcqs
-- Pre-generated MCQs from answer key problems (instructor-verified)
CREATE TABLE public.answer_key_mcqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id UUID NOT NULL REFERENCES public.answer_key_problems(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_latex TEXT,
  correct_answer TEXT NOT NULL,
  correct_answer_latex TEXT,
  distractors JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{text, latex, why_wrong}]
  explanation TEXT,
  explanation_latex TEXT,
  verified BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: answer_key_usage_log
-- Track which problems/MCQs were used in live sessions
CREATE TABLE public.answer_key_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id UUID REFERENCES public.answer_key_problems(id) ON DELETE SET NULL,
  mcq_id UUID REFERENCES public.answer_key_mcqs(id) ON DELETE SET NULL,
  session_id UUID REFERENCES public.live_sessions(id) ON DELETE SET NULL,
  instructor_id UUID NOT NULL REFERENCES public.profiles(id),
  transcript_snippet TEXT,
  match_confidence NUMERIC(4,3), -- 0.000 to 1.000
  match_keywords TEXT[],
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================
-- INDEXES
-- ===========================================

CREATE INDEX idx_answer_keys_instructor ON public.instructor_answer_keys(instructor_id);
CREATE INDEX idx_answer_keys_subject ON public.instructor_answer_keys(subject);
CREATE INDEX idx_answer_keys_status ON public.instructor_answer_keys(status);

CREATE INDEX idx_answer_key_problems_answer_key ON public.answer_key_problems(answer_key_id);
CREATE INDEX idx_answer_key_problems_verified ON public.answer_key_problems(verified_by_instructor);
CREATE INDEX idx_answer_key_problems_keywords ON public.answer_key_problems USING GIN(keywords);
CREATE INDEX idx_answer_key_problems_topic_tags ON public.answer_key_problems USING GIN(topic_tags);

CREATE INDEX idx_answer_key_mcqs_problem ON public.answer_key_mcqs(problem_id);
CREATE INDEX idx_answer_key_mcqs_verified ON public.answer_key_mcqs(verified);

CREATE INDEX idx_answer_key_usage_instructor ON public.answer_key_usage_log(instructor_id);
CREATE INDEX idx_answer_key_usage_session ON public.answer_key_usage_log(session_id);

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================

ALTER TABLE public.instructor_answer_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answer_key_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answer_key_mcqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answer_key_usage_log ENABLE ROW LEVEL SECURITY;

-- instructor_answer_keys policies
CREATE POLICY "Instructors manage their own answer keys"
ON public.instructor_answer_keys FOR ALL
USING (auth.uid() = instructor_id)
WITH CHECK (auth.uid() = instructor_id);

CREATE POLICY "Admins view org answer keys"
ON public.instructor_answer_keys FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND org_id = get_user_org_id(auth.uid())
);

-- answer_key_problems policies
CREATE POLICY "Instructors manage problems in their answer keys"
ON public.answer_key_problems FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.instructor_answer_keys ak
    WHERE ak.id = answer_key_problems.answer_key_id
    AND ak.instructor_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.instructor_answer_keys ak
    WHERE ak.id = answer_key_problems.answer_key_id
    AND ak.instructor_id = auth.uid()
  )
);

-- answer_key_mcqs policies
CREATE POLICY "Instructors manage MCQs for their problems"
ON public.answer_key_mcqs FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.answer_key_problems p
    JOIN public.instructor_answer_keys ak ON ak.id = p.answer_key_id
    WHERE p.id = answer_key_mcqs.problem_id
    AND ak.instructor_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.answer_key_problems p
    JOIN public.instructor_answer_keys ak ON ak.id = p.answer_key_id
    WHERE p.id = answer_key_mcqs.problem_id
    AND ak.instructor_id = auth.uid()
  )
);

-- answer_key_usage_log policies
CREATE POLICY "Instructors view their usage logs"
ON public.answer_key_usage_log FOR SELECT
USING (auth.uid() = instructor_id);

CREATE POLICY "Instructors insert usage logs"
ON public.answer_key_usage_log FOR INSERT
WITH CHECK (auth.uid() = instructor_id);

-- ===========================================
-- TRIGGERS
-- ===========================================

-- Auto-update updated_at
CREATE TRIGGER update_instructor_answer_keys_updated_at
  BEFORE UPDATE ON public.instructor_answer_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_answer_key_problems_updated_at
  BEFORE UPDATE ON public.answer_key_problems
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_answer_key_mcqs_updated_at
  BEFORE UPDATE ON public.answer_key_mcqs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-set org_id from instructor profile
CREATE OR REPLACE FUNCTION public.set_answer_key_org_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.profiles WHERE id = NEW.instructor_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER set_answer_key_org_id_trigger
  BEFORE INSERT ON public.instructor_answer_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.set_answer_key_org_id();

-- Update problem count on answer key when problems change
CREATE OR REPLACE FUNCTION public.update_answer_key_problem_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.instructor_answer_keys
    SET problem_count = (
      SELECT COUNT(*) FROM public.answer_key_problems
      WHERE answer_key_id = NEW.answer_key_id
    )
    WHERE id = NEW.answer_key_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.instructor_answer_keys
    SET problem_count = (
      SELECT COUNT(*) FROM public.answer_key_problems
      WHERE answer_key_id = OLD.answer_key_id
    )
    WHERE id = OLD.answer_key_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_problem_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.answer_key_problems
  FOR EACH ROW
  EXECUTE FUNCTION public.update_answer_key_problem_count();

-- Increment MCQ usage count
CREATE OR REPLACE FUNCTION public.increment_mcq_usage()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.mcq_id IS NOT NULL THEN
    UPDATE public.answer_key_mcqs
    SET usage_count = usage_count + 1
    WHERE id = NEW.mcq_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER increment_mcq_usage_trigger
  AFTER INSERT ON public.answer_key_usage_log
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_mcq_usage();