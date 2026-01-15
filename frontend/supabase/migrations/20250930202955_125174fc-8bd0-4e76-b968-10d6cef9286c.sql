-- Fix the security definer view issue by using security invoker
DROP VIEW IF EXISTS public.student_problems;

CREATE VIEW public.student_problems 
WITH (security_invoker = true)
AS
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