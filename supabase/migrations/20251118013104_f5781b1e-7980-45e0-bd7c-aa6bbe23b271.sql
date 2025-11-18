-- Add auto_grade_model column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN auto_grade_model text NOT NULL DEFAULT 'flash' CHECK (auto_grade_model IN ('flash', 'pro'));

COMMENT ON COLUMN public.profiles.auto_grade_model IS 'AI model for auto-grading: flash (fast, standard) or pro (slower, more accurate)';