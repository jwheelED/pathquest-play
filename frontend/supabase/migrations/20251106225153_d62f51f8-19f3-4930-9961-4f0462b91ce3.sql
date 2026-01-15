-- Add auto-question settings to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS auto_question_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_question_interval INTEGER DEFAULT 15,
ADD COLUMN IF NOT EXISTS last_auto_question_at TIMESTAMP;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_auto_question 
ON profiles(auto_question_enabled) 
WHERE auto_question_enabled = true;

-- Add comment
COMMENT ON COLUMN profiles.auto_question_interval IS 'Interval in minutes for auto-generating questions during lecture (10, 15, 20, or 30)';
COMMENT ON COLUMN profiles.auto_question_enabled IS 'Enable/disable automatic question generation at fixed intervals during lecture recording';
COMMENT ON COLUMN profiles.last_auto_question_at IS 'Timestamp of the last automatically generated question';