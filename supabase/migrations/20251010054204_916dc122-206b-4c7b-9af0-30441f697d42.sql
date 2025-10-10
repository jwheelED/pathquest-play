-- Create storage bucket for lecture materials
INSERT INTO storage.buckets (id, name, public)
VALUES ('lecture-materials', 'lecture-materials', false);

-- Create table for lecture material metadata
CREATE TABLE public.lecture_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES auth.users(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lecture_materials ENABLE ROW LEVEL SECURITY;

-- RLS policies for lecture_materials table
CREATE POLICY "Instructors can manage their own materials"
  ON public.lecture_materials
  FOR ALL
  USING (auth.uid() = instructor_id)
  WITH CHECK (auth.uid() = instructor_id);

-- RLS policies for storage bucket
CREATE POLICY "Instructors can upload their own materials"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'lecture-materials' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Instructors can view their own materials"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'lecture-materials' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Instructors can delete their own materials"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'lecture-materials' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Trigger for updated_at
CREATE TRIGGER update_lecture_materials_updated_at
  BEFORE UPDATE ON public.lecture_materials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();