ALTER TABLE public.instructor_question_bank
  ADD COLUMN IF NOT EXISTS source_material_id uuid REFERENCES public.lecture_materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_material_title text;