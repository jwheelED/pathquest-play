-- Create user stats table for gamification
CREATE TABLE public.user_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  experience_points INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  coins INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_activity_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create STEM problems table
CREATE TABLE public.stem_problems (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subject TEXT NOT NULL, -- 'math', 'physics', 'chemistry', 'computer_science'
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  problem_text TEXT NOT NULL,
  options JSONB, -- For multiple choice questions
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  points_reward INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create spaced repetition schedule table
CREATE TABLE public.spaced_repetition (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  problem_id UUID NOT NULL REFERENCES public.stem_problems(id) ON DELETE CASCADE,
  interval_days INTEGER NOT NULL DEFAULT 1,
  ease_factor DECIMAL(3,2) NOT NULL DEFAULT 2.5,
  repetition_number INTEGER NOT NULL DEFAULT 0,
  next_review_date DATE NOT NULL DEFAULT CURRENT_DATE,
  last_reviewed_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, problem_id)
);

-- Create achievements table
CREATE TABLE public.achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL, -- emoji or icon name
  requirement_type TEXT NOT NULL, -- 'streak', 'xp', 'problems_solved', 'lessons_completed'
  requirement_value INTEGER NOT NULL,
  points_reward INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user achievements junction table
CREATE TABLE public.user_achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

-- Create problem attempts table
CREATE TABLE public.problem_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  problem_id UUID NOT NULL REFERENCES public.stem_problems(id) ON DELETE CASCADE,
  is_correct BOOLEAN NOT NULL,
  time_spent_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stem_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spaced_repetition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.problem_attempts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_stats
CREATE POLICY "Users can access their own stats" ON public.user_stats
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS Policies for spaced_repetition
CREATE POLICY "Users can access their own review schedule" ON public.spaced_repetition
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS Policies for user_achievements
CREATE POLICY "Users can view their own achievements" ON public.user_achievements
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS Policies for problem_attempts
CREATE POLICY "Users can access their own attempts" ON public.problem_attempts
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Public read access for problems and achievements
CREATE POLICY "Anyone can view STEM problems" ON public.stem_problems FOR SELECT USING (true);
CREATE POLICY "Anyone can view achievements" ON public.achievements FOR SELECT USING (true);

-- Create function to update user stats
CREATE OR REPLACE FUNCTION public.update_user_stats()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for user_stats
CREATE TRIGGER update_user_stats_updated_at
BEFORE UPDATE ON public.user_stats
FOR EACH ROW
EXECUTE FUNCTION public.update_user_stats();

-- Insert sample STEM problems
INSERT INTO public.stem_problems (subject, difficulty, problem_text, options, correct_answer, explanation, points_reward) VALUES
('math', 'beginner', 'What is 15 + 27?', '["40", "42", "44", "46"]', '42', 'Add the numbers: 15 + 27 = 42', 10),
('math', 'beginner', 'Solve for x: 2x + 6 = 14', '["x = 2", "x = 4", "x = 6", "x = 8"]', 'x = 4', 'Subtract 6 from both sides: 2x = 8, then divide by 2: x = 4', 15),
('physics', 'intermediate', 'What is the formula for kinetic energy?', '["KE = mv²", "KE = ½mv²", "KE = m²v", "KE = 2mv"]', 'KE = ½mv²', 'Kinetic energy equals half the mass times velocity squared', 20),
('computer_science', 'beginner', 'Which data structure follows LIFO (Last In, First Out)?', '["Queue", "Stack", "Array", "Linked List"]', 'Stack', 'A stack follows LIFO principle - the last element added is the first to be removed', 15),
('chemistry', 'intermediate', 'What is the chemical symbol for sodium?', '["So", "Sm", "Na", "S"]', 'Na', 'Sodium has the chemical symbol Na, from the Latin word natrium', 10);

-- Insert sample achievements
INSERT INTO public.achievements (name, description, icon, requirement_type, requirement_value, points_reward) VALUES
('First Steps', 'Complete your first lesson', '🎯', 'lessons_completed', 1, 50),
('Problem Solver', 'Solve 10 STEM problems correctly', '🧠', 'problems_solved', 10, 100),
('Week Warrior', 'Maintain a 7-day streak', '🔥', 'streak', 7, 150),
('XP Hunter', 'Earn 500 experience points', '⭐', 'xp', 500, 200),
('Einstein Jr.', 'Solve 25 physics problems', '⚗️', 'physics_problems', 25, 300);