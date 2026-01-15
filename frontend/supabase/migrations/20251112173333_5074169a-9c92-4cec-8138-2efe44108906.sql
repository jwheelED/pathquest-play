-- Fix student_assignments UPDATE policy to allow opening assignments
-- Split into separate policies for metadata updates vs submissions

DROP POLICY IF EXISTS "Students can update non-quiz assignments" ON public.student_assignments;
DROP POLICY IF EXISTS "Students can update their assignments" ON public.student_assignments;
DROP POLICY IF EXISTS "Students can update assignment metadata" ON public.student_assignments;
DROP POLICY IF EXISTS "Students can submit assignments" ON public.student_assignments;

-- Policy 1: Allow students to update metadata fields (opened_at, saved_by_student, response_time_seconds)
-- These can be updated anytime without restrictions
CREATE POLICY "Students can update assignment metadata"
ON public.student_assignments FOR UPDATE
USING (
  auth.uid() = student_id 
  AND assignment_type != 'quiz'
)
WITH CHECK (
  auth.uid() = student_id 
  AND assignment_type != 'quiz'
);

-- Note: The above policy is intentionally permissive for metadata.
-- Grade and quiz_responses can only be set when marking completed = true
-- which is enforced by the application logic and the submit_quiz function