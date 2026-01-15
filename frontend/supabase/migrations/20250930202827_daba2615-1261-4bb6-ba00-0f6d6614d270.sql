-- Grant access to the student_problems view
GRANT SELECT ON public.student_problems TO authenticated;
GRANT SELECT ON public.student_problems TO anon;

-- Also update the policy to allow students to view problems
CREATE POLICY "Students can view problems without answers"
ON public.stem_problems
FOR SELECT
USING (
  auth.role() = 'authenticated' AND
  NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'instructor'
  )
);

-- Drop and recreate the view with better permissions
DROP VIEW IF EXISTS public.student_problems;

CREATE VIEW public.student_problems AS
SELECT 
  id,
  subject,
  difficulty,
  problem_text,
  options,
  points_reward,
  created_at
FROM public.stem_problems;

-- Grant usage on the view
GRANT SELECT ON public.student_problems TO authenticated;
GRANT SELECT ON public.student_problems TO anon;