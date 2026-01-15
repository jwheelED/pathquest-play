-- Set REPLICA IDENTITY to FULL to ensure realtime gets complete row data
ALTER TABLE public.student_assignments REPLICA IDENTITY FULL;