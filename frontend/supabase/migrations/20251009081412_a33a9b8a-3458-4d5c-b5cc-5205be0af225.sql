-- Add grade and quiz responses to student_assignments
ALTER TABLE student_assignments 
ADD COLUMN grade numeric,
ADD COLUMN quiz_responses jsonb;