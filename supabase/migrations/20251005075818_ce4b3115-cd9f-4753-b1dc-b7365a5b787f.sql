-- Drop the policy first, then recreate the function, then recreate the policy

-- Drop the dependent policy
DROP POLICY IF EXISTS "users_select_instructor_students" ON public.users;

-- Drop and recreate the function with proper language
DROP FUNCTION IF EXISTS public.can_view_user(uuid, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.can_view_user(_viewer_id uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow users to view themselves
  IF _viewer_id = _target_user_id THEN
    RETURN true;
  END IF;
  
  -- Allow instructors to view their students
  -- Query instructor_students directly without RLS interference
  RETURN EXISTS (
    SELECT 1
    FROM public.instructor_students
    WHERE instructor_id = _viewer_id
      AND student_id = _target_user_id
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.can_view_user(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_user(uuid, uuid) TO anon;

-- Recreate the policy
CREATE POLICY "users_select_instructor_students"
  ON public.users
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.can_view_user(auth.uid(), id));