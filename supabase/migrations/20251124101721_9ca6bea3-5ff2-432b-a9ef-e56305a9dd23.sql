-- Create adaptive difficulty tracking table
CREATE TABLE IF NOT EXISTS public.adaptive_difficulty (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  current_difficulty TEXT NOT NULL DEFAULT 'beginner' CHECK (current_difficulty IN ('beginner', 'intermediate', 'advanced', 'expert')),
  consecutive_correct INTEGER NOT NULL DEFAULT 0,
  consecutive_incorrect INTEGER NOT NULL DEFAULT 0,
  difficulty_history JSONB DEFAULT '[]'::jsonb,
  total_questions_at_level JSONB DEFAULT '{"beginner": 0, "intermediate": 0, "advanced": 0, "expert": 0}'::jsonb,
  success_rate_by_level JSONB DEFAULT '{"beginner": 0, "intermediate": 0, "advanced": 0, "expert": 0}'::jsonb,
  last_difficulty_change TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  org_id UUID REFERENCES public.organizations(id),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.adaptive_difficulty ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own difficulty settings"
  ON public.adaptive_difficulty
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own difficulty settings"
  ON public.adaptive_difficulty
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert their own difficulty settings"
  ON public.adaptive_difficulty
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Instructors can view student difficulty settings"
  ON public.adaptive_difficulty
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.instructor_students
      WHERE instructor_students.instructor_id = auth.uid()
      AND instructor_students.student_id = adaptive_difficulty.user_id
    )
  );

-- Function to get or create adaptive difficulty for user
CREATE OR REPLACE FUNCTION get_adaptive_difficulty(p_user_id UUID)
RETURNS TABLE (
  current_difficulty TEXT,
  consecutive_correct INTEGER,
  consecutive_incorrect INTEGER,
  difficulty_history JSONB,
  total_questions_at_level JSONB,
  success_rate_by_level JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Try to get existing record
  RETURN QUERY
  SELECT 
    ad.current_difficulty,
    ad.consecutive_correct,
    ad.consecutive_incorrect,
    ad.difficulty_history,
    ad.total_questions_at_level,
    ad.success_rate_by_level
  FROM public.adaptive_difficulty ad
  WHERE ad.user_id = p_user_id;
  
  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.adaptive_difficulty (user_id, org_id)
    SELECT p_user_id, org_id FROM public.profiles WHERE id = p_user_id
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN QUERY
    SELECT 
      ad.current_difficulty,
      ad.consecutive_correct,
      ad.consecutive_incorrect,
      ad.difficulty_history,
      ad.total_questions_at_level,
      ad.success_rate_by_level
    FROM public.adaptive_difficulty ad
    WHERE ad.user_id = p_user_id;
  END IF;
END;
$$;

-- Function to update adaptive difficulty based on performance
CREATE OR REPLACE FUNCTION update_adaptive_difficulty(
  p_user_id UUID,
  p_was_correct BOOLEAN,
  p_current_difficulty TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consecutive_correct INTEGER;
  v_consecutive_incorrect INTEGER;
  v_new_difficulty TEXT;
  v_difficulty_changed BOOLEAN := false;
  v_history JSONB;
  v_total_questions JSONB;
  v_success_rates JSONB;
  v_questions_at_level INTEGER;
  v_correct_at_level INTEGER;
BEGIN
  -- Get current state
  SELECT 
    consecutive_correct,
    consecutive_incorrect,
    difficulty_history,
    total_questions_at_level,
    success_rate_by_level
  INTO 
    v_consecutive_correct,
    v_consecutive_incorrect,
    v_history,
    v_total_questions,
    v_success_rates
  FROM public.adaptive_difficulty
  WHERE user_id = p_user_id;
  
  -- Initialize if null
  IF v_consecutive_correct IS NULL THEN
    v_consecutive_correct := 0;
    v_consecutive_incorrect := 0;
    v_history := '[]'::jsonb;
    v_total_questions := '{"beginner": 0, "intermediate": 0, "advanced": 0, "expert": 0}'::jsonb;
    v_success_rates := '{"beginner": 0, "intermediate": 0, "advanced": 0, "expert": 0}'::jsonb;
  END IF;
  
  v_new_difficulty := p_current_difficulty;
  
  -- Update consecutive counters
  IF p_was_correct THEN
    v_consecutive_correct := v_consecutive_correct + 1;
    v_consecutive_incorrect := 0;
  ELSE
    v_consecutive_incorrect := v_consecutive_incorrect + 1;
    v_consecutive_correct := 0;
  END IF;
  
  -- Update question count for current level
  v_questions_at_level := COALESCE((v_total_questions->p_current_difficulty)::INTEGER, 0) + 1;
  v_total_questions := jsonb_set(
    v_total_questions,
    ARRAY[p_current_difficulty],
    to_jsonb(v_questions_at_level)
  );
  
  -- Calculate success rate for current level
  v_correct_at_level := COALESCE((v_success_rates->p_current_difficulty)::NUMERIC, 0) * 
                        (v_questions_at_level - 1);
  IF p_was_correct THEN
    v_correct_at_level := v_correct_at_level + 1;
  END IF;
  
  v_success_rates := jsonb_set(
    v_success_rates,
    ARRAY[p_current_difficulty],
    to_jsonb(ROUND((v_correct_at_level::NUMERIC / v_questions_at_level::NUMERIC) * 100, 2))
  );
  
  -- Adaptive difficulty logic
  -- Increase difficulty: 4 consecutive correct answers AND success rate >= 75%
  IF v_consecutive_correct >= 4 AND 
     v_questions_at_level >= 5 AND
     (v_success_rates->p_current_difficulty)::NUMERIC >= 75 THEN
    
    CASE p_current_difficulty
      WHEN 'beginner' THEN v_new_difficulty := 'intermediate';
      WHEN 'intermediate' THEN v_new_difficulty := 'advanced';
      WHEN 'advanced' THEN v_new_difficulty := 'expert';
      ELSE v_new_difficulty := p_current_difficulty;
    END CASE;
    
    IF v_new_difficulty != p_current_difficulty THEN
      v_difficulty_changed := true;
      v_consecutive_correct := 0;
      v_consecutive_incorrect := 0;
    END IF;
  END IF;
  
  -- Decrease difficulty: 3 consecutive incorrect answers OR success rate < 40% after 8 questions
  IF (v_consecutive_incorrect >= 3) OR 
     (v_questions_at_level >= 8 AND (v_success_rates->p_current_difficulty)::NUMERIC < 40) THEN
    
    CASE p_current_difficulty
      WHEN 'expert' THEN v_new_difficulty := 'advanced';
      WHEN 'advanced' THEN v_new_difficulty := 'intermediate';
      WHEN 'intermediate' THEN v_new_difficulty := 'beginner';
      ELSE v_new_difficulty := p_current_difficulty;
    END CASE;
    
    IF v_new_difficulty != p_current_difficulty THEN
      v_difficulty_changed := true;
      v_consecutive_correct := 0;
      v_consecutive_incorrect := 0;
    END IF;
  END IF;
  
  -- Add to history if difficulty changed
  IF v_difficulty_changed THEN
    v_history := v_history || jsonb_build_object(
      'from', p_current_difficulty,
      'to', v_new_difficulty,
      'timestamp', now(),
      'reason', CASE 
        WHEN p_was_correct THEN 'consistent_success'
        ELSE 'needs_practice'
      END
    );
  END IF;
  
  -- Update the record
  UPDATE public.adaptive_difficulty
  SET
    current_difficulty = v_new_difficulty,
    consecutive_correct = v_consecutive_correct,
    consecutive_incorrect = v_consecutive_incorrect,
    difficulty_history = v_history,
    total_questions_at_level = v_total_questions,
    success_rate_by_level = v_success_rates,
    last_difficulty_change = CASE WHEN v_difficulty_changed THEN now() ELSE last_difficulty_change END,
    updated_at = now()
  WHERE user_id = p_user_id;
  
  RETURN v_new_difficulty;
END;
$$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_adaptive_difficulty_user_id ON public.adaptive_difficulty(user_id);