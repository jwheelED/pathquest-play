-- Add response time tracking to student assignments
ALTER TABLE public.student_assignments
ADD COLUMN IF NOT EXISTS opened_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS response_time_seconds integer;

-- Add comment explaining the columns
COMMENT ON COLUMN public.student_assignments.opened_at IS 'Timestamp when student first opened the assignment';
COMMENT ON COLUMN public.student_assignments.response_time_seconds IS 'Time taken to complete assignment in seconds';