-- Fix search_path for lecture check-in functions to address security linter warnings

-- Update the trigger function with explicit search_path
CREATE OR REPLACE FUNCTION set_lecture_checkin_auto_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set auto_delete_at for lecture_checkin type assignments
  IF NEW.assignment_type = 'lecture_checkin' THEN
    NEW.auto_delete_at := NEW.created_at + INTERVAL '24 hours';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update the cleanup function with explicit search_path
CREATE OR REPLACE FUNCTION cleanup_unsaved_lecture_checkins()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.student_assignments
  WHERE assignment_type = 'lecture_checkin'
    AND saved_by_student = false
    AND auto_delete_at IS NOT NULL
    AND auto_delete_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;