-- Create a public storage bucket for student study materials
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-materials', 'student-materials', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files to their own folder
CREATE POLICY "Students can upload their own materials"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'student-materials' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow anyone to read (public bucket)
CREATE POLICY "Public read access for student materials"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'student-materials');

-- Allow users to delete their own files
CREATE POLICY "Students can delete their own materials"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'student-materials' AND (storage.foldername(name))[1] = auth.uid()::text);