-- Fix RLS policy for lecture_materials to allow instructors without org_id
DROP POLICY IF EXISTS "Org-scoped lecture materials access" ON public.lecture_materials;

-- Allow instructors to manage their own materials regardless of org status
CREATE POLICY "Instructors manage own materials"
ON public.lecture_materials
FOR ALL
TO authenticated
USING (
  auth.uid() = instructor_id
  AND (
    org_id IS NULL 
    OR org_id = get_user_org_id(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  )
)
WITH CHECK (
  auth.uid() = instructor_id
  AND (
    org_id IS NULL 
    OR org_id = get_user_org_id(auth.uid())
  )
);