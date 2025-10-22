-- Fix function search_path for update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create RLS policies for lecture-materials storage bucket
CREATE POLICY "Instructors can view own materials"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'lecture-materials' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Instructors can upload materials"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'lecture-materials' AND
  auth.uid()::text = (storage.foldername(name))[1] AND
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'instructor'
  )
);

CREATE POLICY "Instructors can update own materials"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'lecture-materials' AND
  auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'lecture-materials' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Instructors can delete own materials"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'lecture-materials' AND
  auth.uid()::text = (storage.foldername(name))[1]
);