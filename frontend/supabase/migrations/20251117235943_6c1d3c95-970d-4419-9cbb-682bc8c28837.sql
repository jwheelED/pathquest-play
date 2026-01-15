-- Create table for AI quality ratings
CREATE TABLE IF NOT EXISTS public.ai_quality_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  rating_type TEXT NOT NULL CHECK (rating_type IN ('question_generation', 'transcription')),
  reference_id UUID NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('helpful', 'not_helpful', 'excellent', 'good', 'poor')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_quality_ratings ENABLE ROW LEVEL SECURITY;

-- Instructors can manage their own ratings
CREATE POLICY "Instructors can manage their ratings"
ON public.ai_quality_ratings
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create index for efficient queries
CREATE INDEX idx_ai_quality_ratings_reference ON public.ai_quality_ratings(reference_id, rating_type);
CREATE INDEX idx_ai_quality_ratings_user ON public.ai_quality_ratings(user_id, created_at DESC);