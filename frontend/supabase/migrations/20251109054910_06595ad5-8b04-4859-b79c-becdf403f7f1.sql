-- Add auto-release timer columns to student_assignments table
ALTER TABLE public.student_assignments
ADD COLUMN IF NOT EXISTS auto_release_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_release_minutes integer,
ADD COLUMN IF NOT EXISTS auto_release_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS release_method text;

-- Create helper function to calculate auto-release time
CREATE OR REPLACE FUNCTION public.calculate_auto_release_time(
  p_created_at timestamp with time zone,
  p_minutes integer
)
RETURNS timestamp with time zone
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN p_created_at + (p_minutes || ' minutes')::interval;
END;
$$;

-- Create function to auto-release answers
CREATE OR REPLACE FUNCTION public.auto_release_expired_answers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.student_assignments
  SET answers_released = true,
      release_method = 'auto'
  WHERE auto_release_enabled = true
    AND answers_released = false
    AND auto_release_at IS NOT NULL
    AND auto_release_at <= NOW();
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;