-- Create enum for assignment types
CREATE TYPE public.assignment_type AS ENUM ('quiz', 'lesson', 'mini_project');

-- Create enum for assignment modes
CREATE TYPE public.assignment_mode AS ENUM ('hints_only', 'hints_solutions', 'auto_grade');

-- Create enum for draft status
CREATE TYPE public.draft_status AS ENUM ('draft', 'approved', 'published');

-- Create content drafts table
CREATE TABLE public.content_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  slide_text TEXT NOT NULL,
  code_example TEXT,
  demo_snippets JSONB, -- Array of {title, code, explanation}
  assignment_type assignment_type NOT NULL,
  status draft_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create student assignments table
CREATE TABLE public.student_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  draft_id UUID REFERENCES public.content_drafts(id) ON DELETE CASCADE,
  assignment_type assignment_type NOT NULL,
  mode assignment_mode NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL, -- Questions, hints, solutions based on mode
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.content_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_assignments ENABLE ROW LEVEL SECURITY;

-- RLS policies for content_drafts
CREATE POLICY "Instructors can manage their drafts"
ON public.content_drafts
FOR ALL
USING (auth.uid() = instructor_id)
WITH CHECK (auth.uid() = instructor_id);

-- RLS policies for student_assignments
CREATE POLICY "Instructors can manage their assignments"
ON public.student_assignments
FOR ALL
USING (auth.uid() = instructor_id)
WITH CHECK (auth.uid() = instructor_id);

CREATE POLICY "Students can view their assignments"
ON public.student_assignments
FOR SELECT
USING (auth.uid() = student_id);

CREATE POLICY "Students can update completion status"
ON public.student_assignments
FOR UPDATE
USING (auth.uid() = student_id)
WITH CHECK (auth.uid() = student_id);

-- Create indexes
CREATE INDEX idx_content_drafts_instructor ON public.content_drafts(instructor_id);
CREATE INDEX idx_content_drafts_status ON public.content_drafts(status);
CREATE INDEX idx_student_assignments_student ON public.student_assignments(student_id);
CREATE INDEX idx_student_assignments_instructor ON public.student_assignments(instructor_id);