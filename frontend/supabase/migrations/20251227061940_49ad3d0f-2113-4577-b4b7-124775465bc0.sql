-- Create storage bucket for answer key files
INSERT INTO storage.buckets (id, name, public)
VALUES ('answer-keys', 'answer-keys', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for answer-keys bucket
CREATE POLICY "Instructors can upload answer keys"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'answer-keys' 
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND has_role(auth.uid(), 'instructor'::app_role)
);

CREATE POLICY "Instructors can view their own answer keys"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'answer-keys' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Instructors can delete their own answer keys"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'answer-keys' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);