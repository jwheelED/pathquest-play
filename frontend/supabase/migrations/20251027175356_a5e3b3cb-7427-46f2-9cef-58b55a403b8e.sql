-- Add fields to track saved status and auto-deletion for lecture check-ins
ALTER TABLE public.student_assignments 
ADD COLUMN IF NOT EXISTS saved_by_student boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_delete_at timestamp with time zone DEFAULT NULL;

-- Function to set auto_delete_at for lecture check-ins
CREATE OR REPLACE FUNCTION set_lecture_checkin_auto_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set auto_delete_at for lecture_checkin type assignments
  IF NEW.assignment_type = 'lecture_checkin' THEN
    NEW.auto_delete_at := NEW.created_at + INTERVAL '24 hours';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically set auto_delete_at on insert
DROP TRIGGER IF EXISTS set_auto_delete_trigger ON public.student_assignments;
CREATE TRIGGER set_auto_delete_trigger
  BEFORE INSERT ON public.student_assignments
  FOR EACH ROW
  EXECUTE FUNCTION set_lecture_checkin_auto_delete();

-- Function to clean up unsaved lecture check-ins past their deletion time
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on cleanup function
GRANT EXECUTE ON FUNCTION cleanup_unsaved_lecture_checkins() TO authenticated;

-- Create index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_student_assignments_auto_delete 
ON public.student_assignments(auto_delete_at) 
WHERE assignment_type = 'lecture_checkin' AND saved_by_student = false;