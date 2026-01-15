-- Add AI grading columns to live_responses table for short answer questions
ALTER TABLE live_responses 
  ADD COLUMN IF NOT EXISTS ai_grade numeric,
  ADD COLUMN IF NOT EXISTS ai_feedback text;

COMMENT ON COLUMN live_responses.ai_grade IS 'AI-assigned grade 0-100 for short answer questions';
COMMENT ON COLUMN live_responses.ai_feedback IS 'AI feedback explaining the grade';