-- Add preferred coding language column for STEM instructors
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS preferred_coding_language TEXT DEFAULT 'python';

-- Add check constraint for valid languages
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_preferred_coding_language_check
CHECK (preferred_coding_language IN ('python', 'java', 'javascript', 'cpp', 'c', 'csharp', 'go', 'rust', 'typescript'));

COMMENT ON COLUMN public.profiles.preferred_coding_language IS 'The programming language STEM instructors want coding questions generated and answered in';