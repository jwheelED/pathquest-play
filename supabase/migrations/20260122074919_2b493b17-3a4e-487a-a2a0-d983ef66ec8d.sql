-- Update default model values from Gemini 2.5 to Gemini 3
ALTER TABLE public.profiles
ALTER COLUMN detection_model SET DEFAULT 'google/gemini-3-flash-preview',
ALTER COLUMN transcription_model SET DEFAULT 'google/gemini-3-flash-preview',
ALTER COLUMN generation_model SET DEFAULT 'google/gemini-3-flash-preview',
ALTER COLUMN interval_question_model SET DEFAULT 'google/gemini-3-flash-preview';

-- Update existing records that still have old defaults
UPDATE public.profiles
SET detection_model = 'google/gemini-3-flash-preview'
WHERE detection_model = 'google/gemini-2.5-flash';

UPDATE public.profiles
SET transcription_model = 'google/gemini-3-flash-preview'
WHERE transcription_model = 'google/gemini-2.5-flash';

UPDATE public.profiles
SET generation_model = 'google/gemini-3-flash-preview'
WHERE generation_model = 'google/gemini-2.5-flash';

UPDATE public.profiles
SET interval_question_model = 'google/gemini-3-flash-preview'
WHERE interval_question_model = 'google/gemini-2.5-flash';

-- Update auto_grade_model constraint to include Gemini 3 models
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_auto_grade_model_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_auto_grade_model_check 
CHECK (auto_grade_model IN (
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash-lite',
  'google/gemini-3-flash-preview',
  'google/gemini-3-pro-preview',
  'openai/gpt-5-mini',
  'openai/gpt-5',
  'flash'
));

-- Update existing auto_grade_model values to Gemini 3
UPDATE public.profiles
SET auto_grade_model = 'google/gemini-3-pro-preview'
WHERE auto_grade_model IN ('google/gemini-2.5-pro', 'google/gemini-2.5-flash');