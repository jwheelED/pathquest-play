-- Enable real-time for student_assignments table
ALTER TABLE public.student_assignments REPLICA IDENTITY FULL;

-- Add student_assignments to realtime publication if not already added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'student_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.student_assignments;
  END IF;
END $$;