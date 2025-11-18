-- Create table for caching AI explanations
CREATE TABLE IF NOT EXISTS public.ai_explanation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_hash TEXT NOT NULL,
  wrong_answer TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_explanation_cache ENABLE ROW LEVEL SECURITY;

-- Anyone can read cached explanations
CREATE POLICY "Anyone can read cached explanations"
ON public.ai_explanation_cache
FOR SELECT
USING (true);

-- Service role can insert/update cached explanations
CREATE POLICY "Service role can manage cache"
ON public.ai_explanation_cache
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Create unique index to prevent duplicate cache entries
CREATE UNIQUE INDEX idx_ai_explanation_cache_unique 
ON public.ai_explanation_cache(question_hash, wrong_answer, correct_answer);

-- Create index for efficient cache lookups
CREATE INDEX idx_ai_explanation_cache_lookup 
ON public.ai_explanation_cache(question_hash, wrong_answer, correct_answer);

-- Create index for cleanup queries (old unused entries)
CREATE INDEX idx_ai_explanation_cache_cleanup 
ON public.ai_explanation_cache(last_used_at, usage_count);