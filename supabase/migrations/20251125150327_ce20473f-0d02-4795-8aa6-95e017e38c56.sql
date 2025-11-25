-- Relax org-scoped policy so lecture check-ins with NULL org_id are still visible
ALTER POLICY "Org-scoped assignment access" ON public.student_assignments
USING (
  ((org_id = get_user_org_id(auth.uid()) OR org_id IS NULL)
   AND (
     auth.uid() = instructor_id
     OR auth.uid() = student_id
     OR (
       has_role(auth.uid(), 'admin'::app_role)
       AND EXISTS (
         SELECT 1 FROM admin_instructors
         WHERE admin_instructors.admin_id = auth.uid()
           AND admin_instructors.instructor_id = student_assignments.instructor_id
       )
     )
   ))
)
WITH CHECK (
  ((org_id = get_user_org_id(auth.uid()) OR org_id IS NULL)
   AND (
     auth.uid() = instructor_id
     OR (
       auth.uid() = student_id
       AND assignment_type <> 'quiz'::assignment_type
     )
   ))
);