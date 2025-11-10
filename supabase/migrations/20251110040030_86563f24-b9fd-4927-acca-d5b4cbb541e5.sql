-- Secure stem_problems by restricting direct answer access
-- Create a view that excludes sensitive answer columns for students

CREATE VIEW public.stem_problems_student_view AS
SELECT 
  id, 
  subject, 
  difficulty, 
  problem_text, 
  options, 
  points_reward, 
  created_at
FROM public.stem_problems;

-- Drop the existing overly permissive student SELECT policy
DROP POLICY IF EXISTS "Students can view problems" ON public.stem_problems;

-- Drop the instructor policy temporarily to recreate it
DROP POLICY IF EXISTS "Instructors can view all problems" ON public.stem_problems;

-- Recreate instructor policy (instructors can see everything including answers)
CREATE POLICY "Instructors can view all problems"
ON public.stem_problems
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'instructor'::app_role));

-- Students can only access answers through the get_problem_answer RPC function
-- Direct table access is now restricted to instructors only

-- Grant SELECT on the safe view to authenticated users
GRANT SELECT ON public.stem_problems_student_view TO authenticated;