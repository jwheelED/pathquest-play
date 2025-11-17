-- Add auto-grading preference columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS auto_grade_short_answer boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_grade_coding boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_grade_mcq boolean DEFAULT true;