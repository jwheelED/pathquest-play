-- =====================================================
-- FIX 1: Users table - Add base authentication requirement
-- =====================================================

-- Add a restrictive policy that requires authentication for ALL operations
-- This ensures no access is possible without being logged in
CREATE POLICY "require_authentication"
ON public.users
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- =====================================================
-- FIX 2: Profiles table - Simplify and tighten policies  
-- =====================================================

-- Drop the complex "same org" policy that has multiple OR conditions
DROP POLICY IF EXISTS "Users in same org can view profiles based on role" ON public.profiles;

-- Create separate, clearer policies for each role
-- Instructors can ONLY view their connected students
CREATE POLICY "Instructors can view their students profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'instructor'::app_role) 
  AND EXISTS (
    SELECT 1 FROM instructor_students
    WHERE instructor_students.instructor_id = auth.uid()
    AND instructor_students.student_id = profiles.id
  )
);

-- Students can view their instructor's profile
CREATE POLICY "Students can view their instructor profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'student'::app_role)
  AND EXISTS (
    SELECT 1 FROM instructor_students
    WHERE instructor_students.student_id = auth.uid()
    AND instructor_students.instructor_id = profiles.id
  )
);

-- Admins can view profiles only within their organization
CREATE POLICY "Admins can view org profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND org_id IS NOT NULL
  AND org_id = get_user_org_id(auth.uid())
);

-- =====================================================
-- FIX 3: Student assignments - Restrict to creator/assignee only
-- =====================================================

-- Drop the overly permissive org-scoped policy
DROP POLICY IF EXISTS "Org-scoped assignment access" ON public.student_assignments;

-- Instructors can only manage assignments THEY created
CREATE POLICY "Instructors manage own assignments"
ON public.student_assignments
FOR ALL
TO authenticated
USING (auth.uid() = instructor_id)
WITH CHECK (auth.uid() = instructor_id);

-- Students can view and update their own assignments (but not create quizzes)
CREATE POLICY "Students access own assignments"
ON public.student_assignments
FOR ALL
TO authenticated
USING (auth.uid() = student_id)
WITH CHECK (
  auth.uid() = student_id 
  AND assignment_type <> 'quiz'::assignment_type
);

-- Admins can view assignments from instructors they manage (read-only)
CREATE POLICY "Admins view managed instructor assignments"
ON public.student_assignments
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM admin_instructors
    WHERE admin_instructors.admin_id = auth.uid()
    AND admin_instructors.instructor_id = student_assignments.instructor_id
  )
);