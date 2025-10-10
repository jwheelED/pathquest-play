-- Fix error-level security issues - proper order

-- 1. Drop stem_problems policies that depend on profiles.role
DROP POLICY IF EXISTS "Instructors can view all problems" ON public.stem_problems;
DROP POLICY IF EXISTS "Students can view problems" ON public.stem_problems;

-- 2. Drop profiles policy that depends on role column
DROP POLICY IF EXISTS "Users can update their own profile (not role)" ON public.profiles;

-- 3. Now drop the role column from profiles table
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;

-- 4. Create new simplified profiles policy
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 5. Create new stem_problems policies using has_role() function
CREATE POLICY "Instructors can view all problems"
ON public.stem_problems FOR SELECT
USING (public.has_role(auth.uid(), 'instructor'));

CREATE POLICY "Students can view problems"
ON public.stem_problems FOR SELECT
USING (NOT public.has_role(auth.uid(), 'instructor'));