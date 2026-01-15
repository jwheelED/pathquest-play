-- Enable full row replication for instructor_students table
-- This is required for real-time updates to work properly
ALTER TABLE public.instructor_students REPLICA IDENTITY FULL;