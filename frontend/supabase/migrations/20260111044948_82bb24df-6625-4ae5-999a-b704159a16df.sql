-- Add coding question style preference (simple check-ins vs full problems)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS coding_question_style TEXT DEFAULT 'simple' 
CHECK (coding_question_style IN ('simple', 'full'));