-- Add new fields to answer_version_history for enhanced cheat detection

ALTER TABLE answer_version_history
ADD COLUMN IF NOT EXISTS question_displayed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS first_interaction_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS first_interaction_type text,
ADD COLUMN IF NOT EXISTS first_interaction_size integer,
ADD COLUMN IF NOT EXISTS question_copied boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS question_copied_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS final_answer_length integer,
ADD COLUMN IF NOT EXISTS editing_events_after_first_paste integer DEFAULT 0;

COMMENT ON COLUMN answer_version_history.question_displayed_at IS 'When the question first became visible to the student';
COMMENT ON COLUMN answer_version_history.first_interaction_at IS 'Timestamp of the very first user interaction';
COMMENT ON COLUMN answer_version_history.first_interaction_type IS 'Type of first interaction: typed or pasted';
COMMENT ON COLUMN answer_version_history.first_interaction_size IS 'Character count of first interaction';
COMMENT ON COLUMN answer_version_history.question_copied IS 'Whether the student copied the question text';
COMMENT ON COLUMN answer_version_history.question_copied_at IS 'When the question was copied';
COMMENT ON COLUMN answer_version_history.final_answer_length IS 'Total character count of final answer';
COMMENT ON COLUMN answer_version_history.editing_events_after_first_paste IS 'Number of edit events after the first paste';