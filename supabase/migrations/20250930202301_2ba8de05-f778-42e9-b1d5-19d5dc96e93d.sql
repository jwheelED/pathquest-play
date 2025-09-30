-- Create a view for students that excludes answers
CREATE OR REPLACE VIEW public.student_problems AS
SELECT 
  id,
  subject,
  difficulty,
  problem_text,
  options,
  points_reward,
  created_at
FROM public.stem_problems;

-- Enable RLS on the view
ALTER VIEW public.student_problems SET (security_invoker = true);

-- Update the existing policy on stem_problems to restrict direct access
DROP POLICY IF EXISTS "Anyone can view STEM problems" ON public.stem_problems;

-- Create new policies for stem_problems
-- Instructors can see everything
CREATE POLICY "Instructors can view all stem_problems"
ON public.stem_problems
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'instructor'
  )
);

-- Create a security definer function to get problem answers after attempt
CREATE OR REPLACE FUNCTION public.get_problem_answer(problem_id uuid)
RETURNS TABLE (
  correct_answer text,
  explanation text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the user has attempted this problem
  IF EXISTS (
    SELECT 1 
    FROM public.problem_attempts
    WHERE problem_attempts.user_id = auth.uid()
    AND problem_attempts.problem_id = $1
  ) THEN
    -- Return the answer if they've attempted it
    RETURN QUERY
    SELECT sp.correct_answer, sp.explanation
    FROM public.stem_problems sp
    WHERE sp.id = $1;
  ELSE
    -- Return null if they haven't attempted it
    RETURN QUERY
    SELECT NULL::text, NULL::text;
  END IF;
END;
$$;