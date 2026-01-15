-- Add columns to track when students copy text FROM their answer box
-- This helps detect patterns where students may be sending their answers to external tools or other devices

ALTER TABLE answer_version_history 
ADD COLUMN IF NOT EXISTS answer_copied BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS answer_copy_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS answer_copy_events JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN answer_version_history.answer_copied IS 'Whether the student copied text from their answer box';
COMMENT ON COLUMN answer_version_history.answer_copy_count IS 'Number of times student copied from answer box';
COMMENT ON COLUMN answer_version_history.answer_copy_events IS 'Array of copy events with timestamps and text length';