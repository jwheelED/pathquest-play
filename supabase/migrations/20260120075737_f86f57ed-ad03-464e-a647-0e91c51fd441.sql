-- Change default for question_preview_enabled from true to false
ALTER TABLE public.profiles 
ALTER COLUMN question_preview_enabled SET DEFAULT false;

-- Update comment to reflect new default
COMMENT ON COLUMN public.profiles.question_preview_enabled IS 'When true, shows preview dialog before sending voice/manual questions. When false (default), sends immediately.';