
ALTER TABLE public.lecture_materials
ADD COLUMN IF NOT EXISTS parsed_text TEXT DEFAULT NULL;

COMMENT ON COLUMN public.lecture_materials.parsed_text IS 'Pre-extracted text content from the uploaded file, populated by parse-lecture-material edge function';
