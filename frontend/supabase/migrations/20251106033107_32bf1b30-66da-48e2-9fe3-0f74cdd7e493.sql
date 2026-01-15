-- Add answers_released column to student_assignments table
ALTER TABLE student_assignments 
ADD COLUMN answers_released boolean NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN student_assignments.answers_released IS 'Controls whether students can see correct answers and explanations after submission';

-- Create index for instructor queries to find assignments with unreleased answers
CREATE INDEX idx_student_assignments_answers_released 
ON student_assignments(instructor_id, answers_released, completed) 
WHERE completed = true;