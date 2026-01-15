-- Add adaptive tutoring settings to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS difficulty_mix jsonb DEFAULT '{"recall": 40, "application": 40, "reasoning": 20}'::jsonb,
ADD COLUMN IF NOT EXISTS style_mix jsonb DEFAULT '{"mcq": 70, "short_answer": 30}'::jsonb,
ADD COLUMN IF NOT EXISTS question_preset text DEFAULT 'balanced';

-- Add enhanced question content structure support columns
ALTER TABLE public.lecture_pause_points
ADD COLUMN IF NOT EXISTS difficulty_type text DEFAULT 'application',
ADD COLUMN IF NOT EXISTS follow_up_questions jsonb DEFAULT null,
ADD COLUMN IF NOT EXISTS why_not_other_choices jsonb DEFAULT null;

-- Add response timing tracking
ALTER TABLE public.student_lecture_progress
ADD COLUMN IF NOT EXISTS response_times jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.difficulty_mix IS 'Mix of question difficulty types: recall, application, reasoning (percentages)';
COMMENT ON COLUMN public.profiles.style_mix IS 'Mix of question styles: mcq, short_answer (percentages)';
COMMENT ON COLUMN public.profiles.question_preset IS 'Preset name: balanced, concept_check, deep_understanding, board_prep';
COMMENT ON COLUMN public.lecture_pause_points.difficulty_type IS 'Question difficulty classification: recall, application, reasoning';
COMMENT ON COLUMN public.lecture_pause_points.follow_up_questions IS 'Branching follow-up questions for correct_confident and correct_uncertain paths';
COMMENT ON COLUMN public.lecture_pause_points.why_not_other_choices IS 'Explanations for why each wrong option is incorrect';