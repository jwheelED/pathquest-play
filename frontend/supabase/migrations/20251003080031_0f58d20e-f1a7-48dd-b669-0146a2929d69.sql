-- First, revoke any public access to the users table
REVOKE ALL ON public.users FROM anon;
REVOKE ALL ON public.users FROM authenticated;

-- Ensure RLS is enabled (it should already be, but this ensures it)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them properly as PERMISSIVE
DROP POLICY IF EXISTS "Allow insert for self" ON public.users;
DROP POLICY IF EXISTS "Allow select own data" ON public.users;
DROP POLICY IF EXISTS "Instructors can view their students' profiles" ON public.users;

-- Recreate policies as PERMISSIVE (default) for proper OR logic
CREATE POLICY "Users can insert their own data"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can select their own data"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Instructors can view their students' data"
  ON public.users
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

-- Also fix the stem_problems table to properly hide answers from students
DROP POLICY IF EXISTS "Students can view problems without answers" ON public.stem_problems;
DROP POLICY IF EXISTS "Instructors can view all stem_problems" ON public.stem_problems;

-- Instructors can see everything including answers
CREATE POLICY "Instructors can view all problems"
  ON public.stem_problems
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'instructor'
    )
  );

-- Students can only see problems (answers are handled by the get_problem_answer function)
CREATE POLICY "Students can view problems"
  ON public.stem_problems
  FOR SELECT
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'instructor'
    )
  );