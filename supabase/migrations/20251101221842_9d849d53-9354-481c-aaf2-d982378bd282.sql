-- Add tab switching tracking fields to answer_version_history
ALTER TABLE answer_version_history
ADD COLUMN tab_switch_count integer DEFAULT 0 NOT NULL,
ADD COLUMN total_time_away_seconds integer DEFAULT 0 NOT NULL,
ADD COLUMN tab_switches jsonb DEFAULT '[]'::jsonb NOT NULL,
ADD COLUMN longest_absence_seconds integer DEFAULT 0 NOT NULL,
ADD COLUMN switched_away_immediately boolean DEFAULT false NOT NULL;