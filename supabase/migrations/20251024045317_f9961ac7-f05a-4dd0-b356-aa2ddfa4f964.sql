-- Add unique constraint for upsert functionality on answer_version_history
ALTER TABLE answer_version_history 
ADD CONSTRAINT answer_version_history_student_assignment_unique 
UNIQUE (student_id, assignment_id);