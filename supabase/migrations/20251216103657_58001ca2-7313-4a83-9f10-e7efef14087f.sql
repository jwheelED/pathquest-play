-- Question Reports table for user feedback
CREATE TABLE public.question_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  pause_point_id UUID NOT NULL REFERENCES public.lecture_pause_points(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL, -- wrong_answer, unclear, off_topic, other
  description TEXT,
  status TEXT DEFAULT 'pending', -- pending, reviewed, resolved
  reviewed_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.question_reports ENABLE ROW LEVEL SECURITY;

-- Students can submit reports
CREATE POLICY "Students can submit question reports"
ON public.question_reports FOR INSERT
WITH CHECK (auth.uid() = student_id);

-- Students can view their own reports
CREATE POLICY "Students can view their own reports"
ON public.question_reports FOR SELECT
USING (auth.uid() = student_id);

-- Instructors can view reports for their lectures
CREATE POLICY "Instructors can view reports for their lectures"
ON public.question_reports FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM lecture_pause_points lpp
    JOIN lecture_videos lv ON lv.id = lpp.lecture_video_id
    WHERE lpp.id = question_reports.pause_point_id
    AND lv.instructor_id = auth.uid()
  )
);

-- Instructors can update report status
CREATE POLICY "Instructors can update report status"
ON public.question_reports FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM lecture_pause_points lpp
    JOIN lecture_videos lv ON lv.id = lpp.lecture_video_id
    WHERE lpp.id = question_reports.pause_point_id
    AND lv.instructor_id = auth.uid()
  )
);

-- Add lecture_preferences to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS lecture_preferences JSONB DEFAULT '{"reduce_interruptions": false, "timed_quiz_mode": false, "timer_seconds": 90}'::jsonb;