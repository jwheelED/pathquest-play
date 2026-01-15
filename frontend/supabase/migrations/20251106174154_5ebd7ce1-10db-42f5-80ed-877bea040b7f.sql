-- Add daily question limit to instructor profiles
ALTER TABLE public.profiles
ADD COLUMN daily_question_limit INTEGER DEFAULT 200 CHECK (daily_question_limit > 0 AND daily_question_limit <= 500);

COMMENT ON COLUMN public.profiles.daily_question_limit IS 'Maximum number of lecture check-in questions an instructor can send per day';
