
-- Create slide_preset_questions table
CREATE TABLE public.slide_preset_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id UUID NOT NULL REFERENCES public.lecture_materials(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL,
  slide_number INTEGER NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'mcq',
  question_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  order_index INTEGER NOT NULL DEFAULT 0,
  generation_source TEXT NOT NULL DEFAULT 'auto',
  org_id UUID REFERENCES public.organizations(id),
  course_id UUID REFERENCES public.courses(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.slide_preset_questions ENABLE ROW LEVEL SECURITY;

-- Instructors can select their own questions
CREATE POLICY "Instructors can view their own slide questions"
  ON public.slide_preset_questions
  FOR SELECT
  TO authenticated
  USING (instructor_id = auth.uid());

-- Instructors can insert their own questions
CREATE POLICY "Instructors can create slide questions"
  ON public.slide_preset_questions
  FOR INSERT
  TO authenticated
  WITH CHECK (instructor_id = auth.uid());

-- Instructors can update their own questions
CREATE POLICY "Instructors can update their own slide questions"
  ON public.slide_preset_questions
  FOR UPDATE
  TO authenticated
  USING (instructor_id = auth.uid());

-- Instructors can delete their own questions
CREATE POLICY "Instructors can delete their own slide questions"
  ON public.slide_preset_questions
  FOR DELETE
  TO authenticated
  USING (instructor_id = auth.uid());

-- Index for fast lookup by material
CREATE INDEX idx_slide_preset_questions_material ON public.slide_preset_questions(material_id);
CREATE INDEX idx_slide_preset_questions_slide ON public.slide_preset_questions(material_id, slide_number);

-- Auto-update updated_at
CREATE TRIGGER update_slide_preset_questions_updated_at
  BEFORE UPDATE ON public.slide_preset_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
