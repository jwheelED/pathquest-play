-- Create lesson mastery tracking table
CREATE TABLE public.lesson_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  attempt_count integer NOT NULL DEFAULT 0,
  successful_attempts integer NOT NULL DEFAULT 0,
  mastery_threshold integer NOT NULL DEFAULT 3,
  is_mastered boolean NOT NULL DEFAULT false,
  last_attempt_date timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, lesson_id)
);

-- Enable RLS
ALTER TABLE public.lesson_mastery ENABLE ROW LEVEL SECURITY;

-- Users can manage their own mastery data
CREATE POLICY "Users can manage their own mastery data"
ON public.lesson_mastery
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Instructors can view their students' mastery data
CREATE POLICY "Instructors can view their students' mastery data"
ON public.lesson_mastery
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM instructor_students
    WHERE instructor_students.student_id = lesson_mastery.user_id
    AND instructor_students.instructor_id = auth.uid()
  )
);

-- Create function to calculate adaptive mastery threshold
CREATE OR REPLACE FUNCTION public.calculate_mastery_threshold(
  p_user_id uuid,
  p_lesson_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avg_attempts numeric;
  threshold integer;
BEGIN
  -- Calculate average attempts across all lessons for this user
  SELECT AVG(attempt_count)::numeric
  INTO avg_attempts
  FROM lesson_mastery
  WHERE user_id = p_user_id AND is_mastered = true;
  
  -- Set threshold based on user's history
  -- Fast learners (avg < 5): threshold = 3
  -- Average learners (5-8): threshold = 5
  -- Slower learners (> 8): threshold = 8
  IF avg_attempts IS NULL THEN
    threshold := 3; -- Default for new users
  ELSIF avg_attempts < 5 THEN
    threshold := 3;
  ELSIF avg_attempts < 8 THEN
    threshold := 5;
  ELSE
    threshold := 8;
  END IF;
  
  RETURN threshold;
END;
$$;