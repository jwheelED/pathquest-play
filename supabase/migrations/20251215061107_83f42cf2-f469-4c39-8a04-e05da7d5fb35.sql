-- Allow any authenticated user to read lecture videos
-- This enables students to access their assigned lecture videos
CREATE POLICY "Authenticated users can read lecture videos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'lecture-videos');