-- Add PDF fallback path column to lecture_materials for hybrid PPTX support
-- This stores the path to a converted PDF when a PPTX is uploaded with "preserve animations"
ALTER TABLE public.lecture_materials 
ADD COLUMN IF NOT EXISTS pdf_fallback_path TEXT;

-- Add conversion status to track background PDF generation
ALTER TABLE public.lecture_materials 
ADD COLUMN IF NOT EXISTS pdf_conversion_status TEXT DEFAULT NULL;

-- Add index for faster lookup of materials needing conversion
CREATE INDEX IF NOT EXISTS idx_lecture_materials_pdf_conversion_status 
ON public.lecture_materials(pdf_conversion_status) 
WHERE pdf_conversion_status IS NOT NULL;

COMMENT ON COLUMN public.lecture_materials.pdf_fallback_path IS 'Path to converted PDF for slide extraction when original is PPTX with animations preserved';
COMMENT ON COLUMN public.lecture_materials.pdf_conversion_status IS 'Status of background PDF conversion: pending, processing, completed, failed';