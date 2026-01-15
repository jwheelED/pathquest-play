-- Create daily_challenges table
CREATE TABLE IF NOT EXISTS public.daily_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  challenge_date DATE NOT NULL DEFAULT CURRENT_DATE,
  challenge_type TEXT NOT NULL, -- 'practice_count', 'confidence_win', 'streak', 'study_upload'
  target_value INTEGER NOT NULL,
  current_progress INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  xp_reward INTEGER NOT NULL DEFAULT 50,
  coins_reward INTEGER NOT NULL DEFAULT 25,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, challenge_date, challenge_type)
);

-- Create practice_goals table
CREATE TABLE IF NOT EXISTS public.practice_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL, -- 'daily_practice', 'weekly_wins', 'accuracy_target'
  target_value INTEGER NOT NULL,
  current_progress INTEGER NOT NULL DEFAULT 0,
  deadline DATE NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  xp_reward INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_goals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for daily_challenges
CREATE POLICY "Users manage their own daily challenges"
  ON public.daily_challenges
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Instructors view student daily challenges"
  ON public.daily_challenges
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.instructor_students
      WHERE instructor_students.instructor_id = auth.uid()
      AND instructor_students.student_id = daily_challenges.user_id
    )
  );

-- RLS Policies for practice_goals
CREATE POLICY "Users manage their own practice goals"
  ON public.practice_goals
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Instructors view student practice goals"
  ON public.practice_goals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.instructor_students
      WHERE instructor_students.instructor_id = auth.uid()
      AND instructor_students.student_id = practice_goals.user_id
    )
  );

-- Create indexes
CREATE INDEX idx_daily_challenges_user_date ON public.daily_challenges(user_id, challenge_date);
CREATE INDEX idx_practice_goals_user_deadline ON public.practice_goals(user_id, deadline);

-- Create trigger for updated_at
CREATE TRIGGER update_practice_goals_updated_at
  BEFORE UPDATE ON public.practice_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();