-- Add new achievements for professor-generated questions and lecture check-ins
INSERT INTO achievements (name, description, icon, requirement_type, requirement_value, points_reward) VALUES
('Teacher''s Pet', 'Answer 3 lecture check-in questions correctly in a row', '🍎', 'checkin_streak', 3, 75),
('Quick Learner', 'Complete 5 lecture check-ins', '⚡', 'checkins_completed', 5, 50),
('Class Ace', 'Answer 10 lecture check-ins with perfect scores', '🎓', 'perfect_checkins', 10, 150),
('Practice Makes Perfect', 'Solve 50 practice problems correctly', '💪', 'problems_solved', 50, 250),
('Engaged Student', 'Participate in 20 lecture check-ins', '🙋', 'checkins_completed', 20, 200),
('Master Streak', 'Maintain a 30-day streak', '🔥', 'streak', 30, 500);

-- Create a table to track check-in streaks
CREATE TABLE IF NOT EXISTS public.checkin_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_correct_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.checkin_streaks ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can manage their own check-in streaks"
ON public.checkin_streaks
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Instructors can view their students' check-in streaks"
ON public.checkin_streaks
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM instructor_students
  WHERE instructor_students.student_id = checkin_streaks.user_id
  AND instructor_students.instructor_id = auth.uid()
));