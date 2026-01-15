-- Lecture videos table
CREATE TABLE public.lecture_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id),
  title TEXT NOT NULL,
  description TEXT,
  video_path TEXT NOT NULL,
  video_url TEXT,
  duration_seconds INTEGER,
  transcript JSONB DEFAULT '[]'::jsonb,
  cognitive_analysis JSONB DEFAULT '{}'::jsonb,
  question_count INTEGER DEFAULT 5,
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'analyzing', 'ready', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lecture pause points with questions
CREATE TABLE public.lecture_pause_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_video_id UUID NOT NULL REFERENCES lecture_videos(id) ON DELETE CASCADE,
  pause_timestamp FLOAT NOT NULL,
  cognitive_load_score INTEGER CHECK (cognitive_load_score BETWEEN 1 AND 10),
  reason TEXT,
  question_content JSONB NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('multiple_choice', 'short_answer')),
  is_active BOOLEAN DEFAULT true,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Student lecture progress
CREATE TABLE public.student_lecture_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lecture_video_id UUID NOT NULL REFERENCES lecture_videos(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id),
  video_position FLOAT DEFAULT 0,
  completed_pause_points UUID[] DEFAULT '{}',
  responses JSONB DEFAULT '{}'::jsonb,
  total_points_earned INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(student_id, lecture_video_id)
);

-- Enable RLS
ALTER TABLE public.lecture_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lecture_pause_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_lecture_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lecture_videos
CREATE POLICY "Instructors manage their lecture videos"
ON public.lecture_videos FOR ALL
USING (auth.uid() = instructor_id)
WITH CHECK (auth.uid() = instructor_id);

CREATE POLICY "Students view assigned lecture videos"
ON public.lecture_videos FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM instructor_students
    WHERE instructor_students.student_id = auth.uid()
    AND instructor_students.instructor_id = lecture_videos.instructor_id
  )
);

-- RLS Policies for lecture_pause_points
CREATE POLICY "Instructors manage their pause points"
ON public.lecture_pause_points FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM lecture_videos
    WHERE lecture_videos.id = lecture_pause_points.lecture_video_id
    AND lecture_videos.instructor_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM lecture_videos
    WHERE lecture_videos.id = lecture_pause_points.lecture_video_id
    AND lecture_videos.instructor_id = auth.uid()
  )
);

CREATE POLICY "Students view pause points for assigned lectures"
ON public.lecture_pause_points FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM lecture_videos lv
    JOIN instructor_students ist ON ist.instructor_id = lv.instructor_id
    WHERE lv.id = lecture_pause_points.lecture_video_id
    AND ist.student_id = auth.uid()
  )
);

-- RLS Policies for student_lecture_progress
CREATE POLICY "Students manage their own progress"
ON public.student_lecture_progress FOR ALL
USING (auth.uid() = student_id)
WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Instructors view their students progress"
ON public.student_lecture_progress FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM lecture_videos lv
    WHERE lv.id = student_lecture_progress.lecture_video_id
    AND lv.instructor_id = auth.uid()
  )
);

-- Indexes for performance
CREATE INDEX idx_lecture_videos_instructor ON public.lecture_videos(instructor_id);
CREATE INDEX idx_lecture_videos_status ON public.lecture_videos(status);
CREATE INDEX idx_pause_points_lecture ON public.lecture_pause_points(lecture_video_id);
CREATE INDEX idx_pause_points_timestamp ON public.lecture_pause_points(pause_timestamp);
CREATE INDEX idx_student_progress_student ON public.student_lecture_progress(student_id);
CREATE INDEX idx_student_progress_lecture ON public.student_lecture_progress(lecture_video_id);

-- Trigger to set org_id on lecture videos
CREATE OR REPLACE FUNCTION public.set_lecture_video_org_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM profiles WHERE id = NEW.instructor_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER set_lecture_video_org_id_trigger
BEFORE INSERT ON public.lecture_videos
FOR EACH ROW EXECUTE FUNCTION public.set_lecture_video_org_id();

-- Trigger to update updated_at
CREATE TRIGGER update_lecture_videos_updated_at
BEFORE UPDATE ON public.lecture_videos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();