-- Student questions submitted to instructor during pre-recorded lecture playback
CREATE TABLE IF NOT EXISTS student_lecture_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_video_id UUID REFERENCES lecture_videos(id) ON DELETE CASCADE,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  instructor_id UUID REFERENCES auth.users(id),
  question_text TEXT NOT NULL,
  video_timestamp_seconds INTEGER,
  is_answered BOOLEAN DEFAULT false,
  instructor_reply TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE student_lecture_questions ENABLE ROW LEVEL SECURITY;

-- Students can insert their own questions
CREATE POLICY "students_insert_own_questions"
  ON student_lecture_questions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = student_id);

-- Students can read their own questions (to see replies)
CREATE POLICY "students_read_own_questions"
  ON student_lecture_questions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = student_id);

-- Instructors can read questions addressed to them
CREATE POLICY "instructors_read_their_questions"
  ON student_lecture_questions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = instructor_id);

-- Instructors can update questions addressed to them (to reply)
CREATE POLICY "instructors_update_their_questions"
  ON student_lecture_questions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = instructor_id);
