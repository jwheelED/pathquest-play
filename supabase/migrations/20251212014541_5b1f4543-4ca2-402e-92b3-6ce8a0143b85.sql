-- Create the lecture-videos storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('lecture-videos', 'lecture-videos', false, 524288000)
ON CONFLICT (id) DO NOTHING;

-- Policy: Instructors can upload lecture videos to their own folder
CREATE POLICY "Instructors can upload lecture videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'lecture-videos' 
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.has_role(auth.uid(), 'instructor')
);

-- Policy: Instructors can read their own lecture videos
CREATE POLICY "Instructors can read own lecture videos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'lecture-videos' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Instructors can delete their own lecture videos
CREATE POLICY "Instructors can delete own lecture videos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'lecture-videos' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);