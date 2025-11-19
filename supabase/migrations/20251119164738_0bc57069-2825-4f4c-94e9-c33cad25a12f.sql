-- Drop the existing check constraint on auto_grade_model
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_auto_grade_model_check;

-- Add new check constraint that includes gemini-2.5-pro
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_auto_grade_model_check 
CHECK (auto_grade_model IN (
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash-lite',
  'openai/gpt-5-mini',
  'openai/gpt-5',
  'flash'
));

-- Update auto_grade_model default to gemini 2.5 pro
ALTER TABLE public.profiles
ALTER COLUMN auto_grade_model SET DEFAULT 'google/gemini-2.5-pro';

-- Update existing records to use gemini 2.5 pro
UPDATE public.profiles
SET auto_grade_model = 'google/gemini-2.5-pro'
WHERE auto_grade_model = 'google/gemini-2.5-flash' OR auto_grade_model = 'flash';