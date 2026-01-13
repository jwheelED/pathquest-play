-- Add column for question preview preference
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS question_preview_enabled boolean DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.question_preview_enabled IS 'When true, shows preview dialog before sending voice/manual questions. When false, sends immediately.';