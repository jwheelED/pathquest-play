-- Create question_send_logs table for comprehensive monitoring
CREATE TABLE IF NOT EXISTS public.question_send_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL,
  source TEXT NOT NULL, -- 'voice_command', 'manual_button', 'auto_interval'
  success BOOLEAN NOT NULL,
  error_message TEXT,
  error_type TEXT,
  student_count INTEGER NOT NULL,
  successful_sends INTEGER NOT NULL DEFAULT 0,
  failed_sends INTEGER NOT NULL DEFAULT 0,
  batch_count INTEGER,
  processing_time_ms INTEGER,
  ai_confidence NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for faster queries
CREATE INDEX idx_question_logs_instructor ON public.question_send_logs(instructor_id, created_at DESC);
CREATE INDEX idx_question_logs_success ON public.question_send_logs(success, created_at DESC);

-- Enable RLS
ALTER TABLE public.question_send_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Instructors can view their own logs"
  ON public.question_send_logs
  FOR SELECT
  USING (auth.uid() = instructor_id);

CREATE POLICY "System can insert logs"
  ON public.question_send_logs
  FOR INSERT
  WITH CHECK (true);

-- Create function to clean up old logs (keep last 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_question_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.question_send_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Create student_connection_health table for monitoring
CREATE TABLE IF NOT EXISTS public.student_connection_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL,
  student_count INTEGER NOT NULL,
  checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index
CREATE INDEX idx_connection_health_instructor ON public.student_connection_health(instructor_id, checked_at DESC);

-- Enable RLS
ALTER TABLE public.student_connection_health ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Instructors view their connection health"
  ON public.student_connection_health
  FOR SELECT
  USING (auth.uid() = instructor_id);

CREATE POLICY "System can log connection health"
  ON public.student_connection_health
  FOR INSERT
  WITH CHECK (true);

-- Create function to get instructor success rate
CREATE OR REPLACE FUNCTION public.get_question_success_rate(
  p_instructor_id UUID,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE(
  total_questions INTEGER,
  successful_questions INTEGER,
  failed_questions INTEGER,
  success_rate NUMERIC,
  avg_processing_time_ms NUMERIC,
  most_common_error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total,
    SUM(CASE WHEN success THEN 1 ELSE 0 END)::INTEGER as successful,
    SUM(CASE WHEN NOT success THEN 1 ELSE 0 END)::INTEGER as failed,
    ROUND(
      (SUM(CASE WHEN success THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 
      2
    ) as rate,
    ROUND(AVG(processing_time_ms), 0) as avg_time,
    (
      SELECT error_type 
      FROM public.question_send_logs 
      WHERE instructor_id = p_instructor_id 
        AND NOT success 
        AND created_at > NOW() - (p_days || ' days')::INTERVAL
      GROUP BY error_type 
      ORDER BY COUNT(*) DESC 
      LIMIT 1
    ) as common_error
  FROM public.question_send_logs
  WHERE instructor_id = p_instructor_id
    AND created_at > NOW() - (p_days || ' days')::INTERVAL;
END;
$$;