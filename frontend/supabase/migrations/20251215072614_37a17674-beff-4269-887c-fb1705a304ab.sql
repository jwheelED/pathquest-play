-- Add published column to lecture_videos for instructor visibility control
ALTER TABLE public.lecture_videos 
ADD COLUMN published boolean DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN public.lecture_videos.published IS 'Whether the video is visible to students on their dashboard';