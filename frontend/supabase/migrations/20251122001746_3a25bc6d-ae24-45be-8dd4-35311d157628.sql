-- Create student_study_materials table for uploaded content
CREATE TABLE public.student_study_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id),
  title TEXT NOT NULL,
  description TEXT,
  material_type TEXT NOT NULL CHECK (material_type IN ('note', 'image', 'video', 'pdf', 'audio')),
  content TEXT,
  file_path TEXT,
  video_url TEXT,
  subject_tags TEXT[],
  questions_generated INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_student_materials_user ON public.student_study_materials(user_id);
CREATE INDEX idx_student_materials_type ON public.student_study_materials(material_type);
CREATE INDEX idx_student_materials_tags ON public.student_study_materials USING GIN(subject_tags);
CREATE INDEX idx_student_materials_created ON public.student_study_materials(created_at DESC);

-- Enable RLS
ALTER TABLE public.student_study_materials ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own materials"
ON public.student_study_materials FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own materials"
ON public.student_study_materials FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own materials"
ON public.student_study_materials FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own materials"
ON public.student_study_materials FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Instructors can view their students' materials
CREATE POLICY "Instructors can view student materials"
ON public.student_study_materials FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.instructor_students
    WHERE instructor_id = auth.uid() AND student_id = student_study_materials.user_id
  )
);

-- Create storage bucket for student materials
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-materials', 
  'student-materials', 
  false,
  52428800, -- 50MB limit
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a',
    'video/mp4', 'video/quicktime',
    'text/plain', 'text/markdown'
  ]
);

-- RLS policies for storage bucket
CREATE POLICY "Users can upload their own materials"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'student-materials' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view their own materials"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'student-materials' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own materials"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'student-materials' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own materials"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'student-materials' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Instructors can view student materials
CREATE POLICY "Instructors can view student materials storage"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'student-materials' AND
  EXISTS (
    SELECT 1 FROM public.instructor_students
    WHERE instructor_id = auth.uid() 
    AND student_id = ((storage.foldername(name))[1])::uuid
  )
);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_student_materials_updated_at
BEFORE UPDATE ON public.student_study_materials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();