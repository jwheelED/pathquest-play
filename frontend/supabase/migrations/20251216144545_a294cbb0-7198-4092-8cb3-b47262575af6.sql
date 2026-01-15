-- Create table for tracking diagram generations with daily limit
CREATE TABLE public.diagram_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  concept_context TEXT NOT NULL,
  question_text TEXT,
  image_data TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.diagram_generations ENABLE ROW LEVEL SECURITY;

-- Students can only insert their own diagrams
CREATE POLICY "Students can insert own diagrams"
ON public.diagram_generations
FOR INSERT
WITH CHECK (auth.uid() = student_id);

-- Students can only view their own diagrams
CREATE POLICY "Students can view own diagrams"
ON public.diagram_generations
FOR SELECT
USING (auth.uid() = student_id);

-- Create index for efficient daily limit queries
CREATE INDEX idx_diagram_generations_student_date 
ON public.diagram_generations (student_id, created_at DESC);