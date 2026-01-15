-- Make solution fields nullable to support problem-only uploads
ALTER TABLE answer_key_problems 
  ALTER COLUMN solution_text DROP NOT NULL,
  ALTER COLUMN final_answer DROP NOT NULL;

-- Add has_solution field to track whether this is a problem-only entry
ALTER TABLE answer_key_problems 
  ADD COLUMN has_solution boolean DEFAULT true;

COMMENT ON COLUMN answer_key_problems.has_solution IS 
  'True if the problem includes a worked solution, false if problem-only';