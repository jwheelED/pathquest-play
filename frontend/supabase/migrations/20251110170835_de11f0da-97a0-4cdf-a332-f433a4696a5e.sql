-- Fix 1: Update auto_release_expired_answers to only release completed assignments
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
      release_method = 'auto',
      auto_release_enabled = false
  WHERE auto_release_enabled = true
    AND answers_released = false
    AND completed = true
    AND auto_release_at IS NOT NULL
    AND auto_release_at <= NOW();
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- Fix 2: Create function to set auto-release timer using server-side timestamps
CREATE OR REPLACE FUNCTION public.set_auto_release_timer(
  p_assignment_ids uuid[],
  p_minutes integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.student_assignments
  SET auto_release_enabled = true,
      auto_release_minutes = p_minutes,
      auto_release_at = NOW() + (p_minutes || ' minutes')::interval
  WHERE id = ANY(p_assignment_ids);
END;
$$;