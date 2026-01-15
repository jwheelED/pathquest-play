-- Create rate_limits table for server-side rate limiting
CREATE TABLE public.rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(key, window_start)
);

-- Enable RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view/modify their own rate limit records
CREATE POLICY "Users can manage own rate limits"
ON public.rate_limits
FOR ALL
TO authenticated
USING (key LIKE 'question_detection:' || auth.uid()::text || '%' OR key LIKE 'question_sending:' || auth.uid()::text || '%')
WITH CHECK (key LIKE 'question_detection:' || auth.uid()::text || '%' OR key LIKE 'question_sending:' || auth.uid()::text || '%');

-- Create index for faster lookups
CREATE INDEX idx_rate_limits_key_window ON public.rate_limits(key, window_start DESC);

-- Auto-cleanup old rate limit records (older than 24 hours)
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.rate_limits
  WHERE window_start < NOW() - INTERVAL '24 hours';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;