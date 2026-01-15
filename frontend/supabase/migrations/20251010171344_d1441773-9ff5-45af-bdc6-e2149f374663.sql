-- ============================================
-- SECURITY FIX: Implement proper role management
-- ============================================

-- 1. Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'instructor', 'student');

-- 2. Create user_roles table with strict RLS
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

-- Only service role can insert/update/delete roles (no user can modify their own role)
-- No policies for INSERT, UPDATE, DELETE means only service role can do these operations

-- 3. Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

-- 4. Create function to validate instructor codes without exposing all codes
CREATE OR REPLACE FUNCTION public.validate_instructor_code(code TEXT)
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id 
  FROM profiles 
  WHERE instructor_code = code 
  AND role = 'instructor'
  LIMIT 1;
$$;

-- 5. Create secure quiz submission function
CREATE OR REPLACE FUNCTION public.submit_quiz(
  p_assignment_id UUID,
  p_user_answers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment RECORD;
  v_correct_count INTEGER := 0;
  v_total_questions INTEGER;
  v_calculated_grade NUMERIC;
  v_question JSONB;
  v_i INTEGER;
BEGIN
  -- Verify assignment belongs to calling user and isn't completed
  SELECT * INTO v_assignment
  FROM student_assignments
  WHERE id = p_assignment_id
  AND student_id = auth.uid()
  AND completed = false;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found or already completed';
  END IF;
  
  -- Validate answer structure
  v_total_questions := jsonb_array_length(v_assignment.content->'questions');
  
  IF jsonb_object_length(p_user_answers) != v_total_questions THEN
    RAISE EXCEPTION 'Invalid answer count. Expected % answers, got %', 
      v_total_questions, jsonb_object_length(p_user_answers);
  END IF;
  
  -- Server-side grade calculation
  FOR v_i IN 0..v_total_questions-1 LOOP
    v_question := v_assignment.content->'questions'->v_i;
    IF p_user_answers->>v_i::text = v_question->>'correctAnswer' THEN
      v_correct_count := v_correct_count + 1;
    END IF;
  END LOOP;
  
  v_calculated_grade := (v_correct_count::NUMERIC / v_total_questions) * 100;
  
  -- Update with server-calculated grade
  UPDATE student_assignments
  SET completed = true,
      quiz_responses = p_user_answers,
      grade = v_calculated_grade
  WHERE id = p_assignment_id;
  
  RETURN jsonb_build_object(
    'grade', v_calculated_grade, 
    'correct', v_correct_count,
    'total', v_total_questions
  );
END;
$$;

-- 6. Migrate existing role data from profiles to user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT id, role::app_role
FROM profiles
WHERE role IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- 7. Update RLS policies to use has_role function

-- Update profiles policy to prevent role modification
DROP POLICY IF EXISTS "Users can access their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile (not role)"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id 
  AND role = (SELECT role FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- Remove the public instructor code viewing policy
DROP POLICY IF EXISTS "authenticated_can_view_instructor_codes" ON public.profiles;

-- Update student_assignments policies to prevent grade manipulation
DROP POLICY IF EXISTS "Students can update completion status" ON public.student_assignments;

CREATE POLICY "Students can update non-quiz assignments"
ON public.student_assignments FOR UPDATE
USING (
  auth.uid() = student_id 
  AND assignment_type != 'quiz'
)
WITH CHECK (
  auth.uid() = student_id 
  AND assignment_type != 'quiz'
  AND completed = true
);

-- 8. Update handle_new_user trigger to use user_roles table
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := NEW.raw_user_meta_data->>'role';
  
  -- Handle instructor role
  IF v_role = 'instructor' THEN
    INSERT INTO public.profiles (id, full_name, role, onboarded, instructor_code)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'full_name',
      'instructor',
      true,
      generate_instructor_code()
    );
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'instructor'::app_role);
    
    INSERT INTO public.users (id, user_id, name, email)
    VALUES (NEW.id, NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email);
    
  -- Handle admin role  
  ELSIF v_role = 'admin' THEN
    INSERT INTO public.profiles (id, full_name, role, onboarded)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'full_name',
      'admin',
      true
    );
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role);
    
    INSERT INTO public.users (id, user_id, name, email)
    VALUES (NEW.id, NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email);
    
  -- Handle student role (default)
  ELSE
    INSERT INTO public.profiles (id, full_name, role, onboarded)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Student'),
      'student',
      false
    );
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'student'::app_role);
  END IF;
  
  RETURN NEW;
END;
$$;