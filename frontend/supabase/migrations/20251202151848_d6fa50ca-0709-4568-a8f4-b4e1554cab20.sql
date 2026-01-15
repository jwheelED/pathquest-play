-- Add strict interval mode setting to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS auto_question_strict_mode boolean DEFAULT true;

-- Add comment explaining the column
COMMENT ON COLUMN public.profiles.auto_question_strict_mode IS 'When enabled, forces question generation at every interval regardless of content quality';