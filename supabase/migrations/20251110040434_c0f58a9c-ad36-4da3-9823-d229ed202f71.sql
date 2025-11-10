-- Fix stem_problems_student_view to use security_invoker = true
-- This ensures the view executes with the querying user's privileges, not the creator's
-- and properly enforces Row Level Security policies

DROP VIEW IF EXISTS public.stem_problems_student_view;

CREATE VIEW public.stem_problems_student_view
WITH (security_invoker = true)  -- Execute with user's privileges, not creator's
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

-- Grant SELECT on the safe view to authenticated users
GRANT SELECT ON public.stem_problems_student_view TO authenticated;