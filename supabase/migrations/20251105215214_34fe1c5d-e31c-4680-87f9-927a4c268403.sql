-- Add question format preference to profiles table
ALTER TABLE public.profiles 
ADD COLUMN question_format_preference text DEFAULT 'multiple_choice' 
CHECK (question_format_preference IN ('multiple_choice', 'short_answer', 'coding'));

COMMENT ON COLUMN public.profiles.question_format_preference IS 'Instructor preference for lecture check-in question format';