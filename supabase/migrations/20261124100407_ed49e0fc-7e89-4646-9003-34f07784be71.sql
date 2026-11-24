ALTER TABLE public.lecture_materials ADD COLUMN IF NOT EXISTS is_worksheet boolean;

CREATE TABLE public.worksheet_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.lecture_materials(id) ON DELETE CASCADE,
  course_id uuid,
  instructor_id uuid NOT NULL,
  number integer NOT NULL,
  part text NOT NULL DEFAULT '',
  prompt text NOT NULL,
  question_type text NOT NULL DEFAULT 'multiple_choice',
  options jsonb,
  correct_answer text,
  explanation text,
  ai_filled boolean NOT NULL DEFAULT false,
  edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (material_id, number, part)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worksheet_items TO authenticated;
GRANT ALL ON public.worksheet_items TO service_role;

ALTER TABLE public.worksheet_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors manage own worksheet items"
ON public.worksheet_items FOR ALL TO authenticated
USING (instructor_id = auth.uid())
WITH CHECK (instructor_id = auth.uid());

CREATE INDEX worksheet_items_material_idx ON public.worksheet_items(material_id);

CREATE TRIGGER update_worksheet_items_updated_at
BEFORE UPDATE ON public.worksheet_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();