-- Create practice_sessions table for confidence-based practice tracking
CREATE TABLE public.practice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  problem_id UUID NOT NULL,
  problem_text TEXT NOT NULL,
  confidence_level TEXT NOT NULL CHECK (confidence_level IN ('low', 'medium', 'high', 'very_high')),
  confidence_multiplier NUMERIC NOT NULL,
  is_correct BOOLEAN NOT NULL,
  xp_earned INTEGER NOT NULL,
  coins_earned INTEGER NOT NULL,
  time_spent_seconds INTEGER,
  org_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_practice_sessions_user ON public.practice_sessions(user_id);
CREATE INDEX idx_practice_sessions_problem ON public.practice_sessions(problem_id);
CREATE INDEX idx_practice_sessions_created ON public.practice_sessions(created_at DESC);

-- Enable RLS
ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies for practice_sessions
CREATE POLICY "Users can view their own practice sessions"
ON public.practice_sessions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own practice sessions"
ON public.practice_sessions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Instructors can view student practice sessions"
ON public.practice_sessions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.instructor_students
    WHERE instructor_id = auth.uid() AND student_id = practice_sessions.user_id
  )
);

-- Add gambling statistics to user_stats table
ALTER TABLE public.user_stats
ADD COLUMN total_gambles INTEGER DEFAULT 0,
ADD COLUMN successful_gambles INTEGER DEFAULT 0,
ADD COLUMN biggest_win INTEGER DEFAULT 0,
ADD COLUMN biggest_loss INTEGER DEFAULT 0;

-- Add confidence accuracy tracking
ALTER TABLE public.user_stats
ADD COLUMN confidence_accuracy JSONB DEFAULT '{"low": {"correct": 0, "total": 0}, "medium": {"correct": 0, "total": 0}, "high": {"correct": 0, "total": 0}, "very_high": {"correct": 0, "total": 0}}'::jsonb;