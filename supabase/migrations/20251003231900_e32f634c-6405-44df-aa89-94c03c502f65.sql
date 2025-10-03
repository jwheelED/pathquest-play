
-- Create a security definer function to check if a user can view a student
-- This bypasses RLS policies and prevents recursive policy evaluation issues
CREATE OR REPLACE FUNCTION public.can_view_user(_viewer_id uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Allow users to view themselves
  SELECT (_viewer_id = _target_user_id)
  OR
  -- Allow instructors to view their students
  EXISTS (
    SELECT 1
    FROM instructor_students
    WHERE instructor_id = _viewer_id
      AND student_id = _target_user_id
  );
$$;

-- Drop and recreate the instructor students policy using the function
DROP POLICY IF EXISTS "users_select_instructor_students" ON public.users;

CREATE POLICY "users_select_instructor_students"
  ON public.users
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.can_view_user(auth.uid(), id));
