-- Add question difficulty preference column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS question_difficulty_preference TEXT DEFAULT 'easy';

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.question_difficulty_preference IS 'Instructor preference for generated question difficulty: easy, medium, or hard';