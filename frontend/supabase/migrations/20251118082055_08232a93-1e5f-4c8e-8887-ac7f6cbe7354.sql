-- Create organizations table
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  admin_code text UNIQUE NOT NULL,
  instructor_invite_code text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Function to generate admin codes
CREATE OR REPLACE FUNCTION public.generate_admin_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN 'ADM-' || result;
END;
$$;

-- Function to generate org invite codes
CREATE OR REPLACE FUNCTION public.generate_org_invite_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN 'ORG-' || result;
END;
$$;

-- Add org_id to profiles
ALTER TABLE public.profiles ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add org_id to other tables
ALTER TABLE public.instructor_students ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.student_assignments ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_stats ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.lesson_progress ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_achievements ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.lecture_materials ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.lecture_questions ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.content_drafts ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Function to get user's organization ID
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT org_id FROM public.profiles WHERE id = _user_id;
$$;

-- Function to validate organization admin code
CREATE OR REPLACE FUNCTION public.validate_admin_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  org_uuid uuid;
BEGIN
  SELECT id INTO org_uuid
  FROM public.organizations
  WHERE admin_code = _code
  LIMIT 1;
  
  RETURN org_uuid;
END;
$$;

-- Function to validate organization invite code
CREATE OR REPLACE FUNCTION public.validate_org_invite_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  org_uuid uuid;
BEGIN
  SELECT id INTO org_uuid
  FROM public.organizations
  WHERE instructor_invite_code = _code
  LIMIT 1;
  
  RETURN org_uuid;
END;
$$;

-- RLS Policies for organizations
CREATE POLICY "Users can view their own organization"
ON public.organizations
FOR SELECT
TO authenticated
USING (id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can update their organization"
ON public.organizations
FOR UPDATE
TO authenticated
USING (
  id = get_user_org_id(auth.uid()) 
  AND has_role(auth.uid(), 'admin')
)
WITH CHECK (
  id = get_user_org_id(auth.uid()) 
  AND has_role(auth.uid(), 'admin')
);

-- Update profiles RLS policies to be org-scoped
DROP POLICY IF EXISTS "Instructors can view their students' profiles" ON public.profiles;
DROP POLICY IF EXISTS "Students can view their instructors' profiles" ON public.profiles;

CREATE POLICY "Users in same org can view profiles based on role"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  -- Users can view their own profile
  auth.uid() = id
  OR
  -- Admins can view all profiles in their org
  (has_role(auth.uid(), 'admin') AND org_id = get_user_org_id(auth.uid()))
  OR
  -- Instructors can view their students
  (has_role(auth.uid(), 'instructor') AND EXISTS (
    SELECT 1 FROM instructor_students
    WHERE instructor_id = auth.uid() AND student_id = profiles.id
  ))
  OR
  -- Students can view their instructors
  (has_role(auth.uid(), 'student') AND EXISTS (
    SELECT 1 FROM instructor_students
    WHERE student_id = auth.uid() AND instructor_id = profiles.id
  ))
);

-- Update instructor_students RLS policies
DROP POLICY IF EXISTS "Instructors can view their students" ON public.instructor_students;
DROP POLICY IF EXISTS "Students can view their instructors" ON public.instructor_students;
DROP POLICY IF EXISTS "Instructors can add students" ON public.instructor_students;
DROP POLICY IF EXISTS "Students can join classes" ON public.instructor_students;

CREATE POLICY "Org-scoped instructor student relationships"
ON public.instructor_students
FOR ALL
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid())
  AND (
    auth.uid() = instructor_id 
    OR auth.uid() = student_id
    OR has_role(auth.uid(), 'admin')
  )
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND (
    auth.uid() = instructor_id 
    OR auth.uid() = student_id
  )
);

-- Update student_assignments RLS policies
DROP POLICY IF EXISTS "Instructors can manage their assignments" ON public.student_assignments;
DROP POLICY IF EXISTS "Students can view their assignments" ON public.student_assignments;
DROP POLICY IF EXISTS "Students can update assignment metadata" ON public.student_assignments;

CREATE POLICY "Org-scoped assignment access"
ON public.student_assignments
FOR ALL
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid())
  AND (
    auth.uid() = instructor_id
    OR auth.uid() = student_id
    OR has_role(auth.uid(), 'admin')
  )
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND (
    auth.uid() = instructor_id
    OR (auth.uid() = student_id AND assignment_type <> 'quiz')
  )
);

-- Update user_stats RLS policies
DROP POLICY IF EXISTS "Users can access their own stats" ON public.user_stats;
DROP POLICY IF EXISTS "Instructors can view their students' stats" ON public.user_stats;

CREATE POLICY "Org-scoped user stats access"
ON public.user_stats
FOR ALL
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid())
  AND (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'admin')
    OR (has_role(auth.uid(), 'instructor') AND EXISTS (
      SELECT 1 FROM instructor_students
      WHERE instructor_id = auth.uid() AND student_id = user_stats.user_id
    ))
  )
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND auth.uid() = user_id
);

-- Update lesson_progress RLS policies
DROP POLICY IF EXISTS "Allow select own progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Allow insert own progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Allow update/delete own progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Instructors can view their students' progress" ON public.lesson_progress;

CREATE POLICY "Org-scoped lesson progress access"
ON public.lesson_progress
FOR ALL
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid())
  AND (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'admin')
    OR (has_role(auth.uid(), 'instructor') AND EXISTS (
      SELECT 1 FROM instructor_students
      WHERE instructor_id = auth.uid() AND student_id = lesson_progress.user_id
    ))
  )
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND auth.uid() = user_id
);

-- Update user_achievements RLS policies
DROP POLICY IF EXISTS "Users can view their own achievements" ON public.user_achievements;
DROP POLICY IF EXISTS "Instructors can view their students' achievements" ON public.user_achievements;

CREATE POLICY "Org-scoped achievements access"
ON public.user_achievements
FOR ALL
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid())
  AND (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'admin')
    OR (has_role(auth.uid(), 'instructor') AND EXISTS (
      SELECT 1 FROM instructor_students
      WHERE instructor_id = auth.uid() AND student_id = user_achievements.user_id
    ))
  )
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND auth.uid() = user_id
);

-- Update lecture_materials RLS policies
DROP POLICY IF EXISTS "Instructors can manage their own materials" ON public.lecture_materials;

CREATE POLICY "Org-scoped lecture materials access"
ON public.lecture_materials
FOR ALL
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid())
  AND (
    auth.uid() = instructor_id
    OR has_role(auth.uid(), 'admin')
  )
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND auth.uid() = instructor_id
);

-- Update content_drafts RLS policies
DROP POLICY IF EXISTS "Instructors can manage their drafts" ON public.content_drafts;

CREATE POLICY "Org-scoped content drafts access"
ON public.content_drafts
FOR ALL
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid())
  AND (
    auth.uid() = instructor_id
    OR has_role(auth.uid(), 'admin')
  )
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND auth.uid() = instructor_id
);

-- Update messages RLS policies
DROP POLICY IF EXISTS "Users can view their messages" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update their received messages" ON public.messages;

CREATE POLICY "Org-scoped messages access"
ON public.messages
FOR ALL
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid())
  AND (
    auth.uid() = sender_id 
    OR auth.uid() = recipient_id
    OR has_role(auth.uid(), 'admin')
  )
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND auth.uid() = sender_id
);

-- Create trigger to auto-set org_id on profiles
CREATE OR REPLACE FUNCTION public.set_profile_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- If org_id is not set, keep it null (will be set during onboarding)
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_profile_org_id_trigger
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_profile_org_id();