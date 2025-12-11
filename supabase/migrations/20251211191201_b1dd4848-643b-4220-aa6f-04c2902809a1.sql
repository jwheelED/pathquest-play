-- Create lecture concept map table for concept-to-timestamp mappings
CREATE TABLE public.lecture_concept_map (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lecture_video_id UUID NOT NULL REFERENCES public.lecture_videos(id) ON DELETE CASCADE,
  concept_name TEXT NOT NULL,
  start_timestamp DOUBLE PRECISION NOT NULL,
  end_timestamp DOUBLE PRECISION NOT NULL,
  prerequisites TEXT[] DEFAULT '{}',
  difficulty_level TEXT DEFAULT 'intermediate',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create remediation history table to track student remediation loops
CREATE TABLE public.remediation_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lecture_video_id UUID NOT NULL REFERENCES public.lecture_videos(id) ON DELETE CASCADE,
  pause_point_id UUID REFERENCES public.lecture_pause_points(id) ON DELETE SET NULL,
  misconception_detected TEXT NOT NULL,
  missing_concept TEXT,
  remediation_timestamp DOUBLE PRECISION NOT NULL,
  remediation_end_timestamp DOUBLE PRECISION,
  ai_explanation TEXT NOT NULL,
  follow_up_question JSONB,
  follow_up_answered BOOLEAN DEFAULT false,
  follow_up_correct BOOLEAN,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.lecture_concept_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remediation_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for lecture_concept_map
CREATE POLICY "Instructors manage their lecture concept maps"
  ON public.lecture_concept_map FOR ALL
  USING (EXISTS (
    SELECT 1 FROM lecture_videos 
    WHERE lecture_videos.id = lecture_concept_map.lecture_video_id 
    AND lecture_videos.instructor_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM lecture_videos 
    WHERE lecture_videos.id = lecture_concept_map.lecture_video_id 
    AND lecture_videos.instructor_id = auth.uid()
  ));

CREATE POLICY "Students view concept maps for assigned lectures"
  ON public.lecture_concept_map FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM lecture_videos lv
    JOIN instructor_students ist ON ist.instructor_id = lv.instructor_id
    WHERE lv.id = lecture_concept_map.lecture_video_id 
    AND ist.student_id = auth.uid()
  ));

-- RLS policies for remediation_history
CREATE POLICY "Students manage their own remediation history"
  ON public.remediation_history FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Instructors view student remediation history"
  ON public.remediation_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM instructor_students
    WHERE instructor_students.instructor_id = auth.uid()
    AND instructor_students.student_id = remediation_history.student_id
  ));

-- Indexes for performance
CREATE INDEX idx_concept_map_lecture ON public.lecture_concept_map(lecture_video_id);
CREATE INDEX idx_concept_map_timestamps ON public.lecture_concept_map(start_timestamp, end_timestamp);
CREATE INDEX idx_remediation_student ON public.remediation_history(student_id);
CREATE INDEX idx_remediation_lecture ON public.remediation_history(lecture_video_id);