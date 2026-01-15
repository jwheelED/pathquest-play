-- Add 'medical' to professor_type enum
ALTER TYPE professor_type ADD VALUE IF NOT EXISTS 'medical';

-- Add medical-specific fields to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS medical_specialty text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS exam_style_preference text DEFAULT 'usmle_step1';

-- Add medical domain fields to lecture_videos
ALTER TABLE public.lecture_videos
ADD COLUMN IF NOT EXISTS domain_type text DEFAULT 'general',
ADD COLUMN IF NOT EXISTS extracted_entities jsonb DEFAULT '[]'::jsonb;

-- Create medical_entities table for structured entity storage
CREATE TABLE IF NOT EXISTS public.lecture_medical_entities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lecture_video_id uuid NOT NULL REFERENCES public.lecture_videos(id) ON DELETE CASCADE,
  entity_type text NOT NULL, -- 'pathology', 'treatment', 'mechanism', 'finding', 'risk_factor'
  entity_name text NOT NULL,
  description text,
  start_timestamp double precision,
  end_timestamp double precision,
  related_entities text[] DEFAULT '{}',
  clinical_context jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lecture_medical_entities ENABLE ROW LEVEL SECURITY;

-- RLS policies for medical entities
CREATE POLICY "Instructors manage their lecture medical entities"
ON public.lecture_medical_entities FOR ALL
USING (EXISTS (
  SELECT 1 FROM lecture_videos
  WHERE lecture_videos.id = lecture_medical_entities.lecture_video_id
  AND lecture_videos.instructor_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM lecture_videos
  WHERE lecture_videos.id = lecture_medical_entities.lecture_video_id
  AND lecture_videos.instructor_id = auth.uid()
));

CREATE POLICY "Students view medical entities for assigned lectures"
ON public.lecture_medical_entities FOR SELECT
USING (EXISTS (
  SELECT 1 FROM lecture_videos lv
  JOIN instructor_students ist ON ist.instructor_id = lv.instructor_id
  WHERE lv.id = lecture_medical_entities.lecture_video_id
  AND ist.student_id = auth.uid()
));

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_lecture_medical_entities_video ON public.lecture_medical_entities(lecture_video_id);
CREATE INDEX IF NOT EXISTS idx_lecture_medical_entities_type ON public.lecture_medical_entities(entity_type);