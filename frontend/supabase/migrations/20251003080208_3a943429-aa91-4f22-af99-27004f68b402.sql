-- Fix 1: Comprehensive protection for users table
-- Drop and recreate all policies ensuring they are PERMISSIVE (not RESTRICTIVE)
DROP POLICY IF EXISTS "Users can insert their own data" ON public.users;
DROP POLICY IF EXISTS "Users can select their own data" ON public.users;
DROP POLICY IF EXISTS "Instructors can view their students' data" ON public.users;

-- Block anonymous access completely
REVOKE ALL ON public.users FROM anon;

-- Grant minimal permissions to authenticated role
GRANT SELECT, INSERT ON public.users TO authenticated;

-- PERMISSIVE policies (default) - these use OR logic
CREATE POLICY "users_insert_own"
  ON public.users
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users_select_own"
  ON public.users
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "users_select_instructor_students"
  ON public.users
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.instructor_students
      WHERE instructor_students.student_id = users.id
        AND instructor_students.instructor_id = auth.uid()
    )
  );

-- Add UPDATE and DELETE policies for completeness
CREATE POLICY "users_update_own"
  ON public.users
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users_delete_own"
  ON public.users
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- Fix 2: Restrict instructor code visibility in profiles
DROP POLICY IF EXISTS "Anyone can view instructor codes" ON public.profiles;

-- Only authenticated users can view instructor codes (for joining classes)
CREATE POLICY "authenticated_can_view_instructor_codes"
  ON public.profiles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (role = 'instructor');

-- Fix 3: Handle student_problems - since it's a view, we need to check the underlying table
-- First, let's see if student_problems is actually used anywhere
-- If it's based on stem_problems, the stem_problems policies will handle security