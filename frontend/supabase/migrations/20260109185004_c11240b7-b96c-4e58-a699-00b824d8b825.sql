-- =============================================
-- Multi-Course Support Migration (Part 1: Schema Changes)
-- =============================================

-- 1. Create generate_course_code function
CREATE OR REPLACE FUNCTION public.generate_course_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- 2. Add course_id column to instructor_students FIRST (before creating courses table with RLS referencing it)
ALTER TABLE public.instructor_students
ADD COLUMN IF NOT EXISTS course_id uuid;

-- 3. Create the courses table
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id),
  
  -- Course details
  title text NOT NULL,
  description text,
  topics text[] DEFAULT '{}',
  schedule text,
  course_type text DEFAULT 'stem',
  
  -- Unique join code per course
  course_code text UNIQUE NOT NULL DEFAULT generate_course_code(),
  
  -- Status
  is_active boolean DEFAULT true,
  archived_at timestamptz,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Add FK constraint to instructor_students now that courses table exists
ALTER TABLE public.instructor_students
ADD CONSTRAINT fk_instructor_students_course
FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;

-- 5. Create indexes for courses
CREATE INDEX IF NOT EXISTS idx_courses_instructor ON public.courses(instructor_id);
CREATE INDEX IF NOT EXISTS idx_courses_org ON public.courses(org_id);
CREATE INDEX IF NOT EXISTS idx_courses_code ON public.courses(course_code);
CREATE INDEX IF NOT EXISTS idx_instructor_students_course ON public.instructor_students(course_id);

-- 6. Enable RLS on courses
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for courses (now course_id column exists on instructor_students)
CREATE POLICY "Instructors manage their own courses"
ON public.courses
FOR ALL
USING (auth.uid() = instructor_id)
WITH CHECK (auth.uid() = instructor_id);

CREATE POLICY "Students view enrolled courses"
ON public.courses
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.instructor_students
    WHERE instructor_students.course_id = courses.id
      AND instructor_students.student_id = auth.uid()
  )
);

CREATE POLICY "Admins view org courses"
ON public.courses
FOR SELECT
USING (
  org_id IS NOT NULL 
  AND org_id = get_user_org_id(auth.uid())
  AND has_role(auth.uid(), 'admin')
);

-- 8. Add course_id to other tables
ALTER TABLE public.live_sessions
ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_live_sessions_course ON public.live_sessions(course_id);

ALTER TABLE public.lecture_materials
ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lecture_materials_course ON public.lecture_materials(course_id);

ALTER TABLE public.lecture_videos
ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lecture_videos_course ON public.lecture_videos(course_id);

ALTER TABLE public.instructor_answer_keys
ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_instructor_answer_keys_course ON public.instructor_answer_keys(course_id);

ALTER TABLE public.lecture_questions
ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lecture_questions_course ON public.lecture_questions(course_id);

ALTER TABLE public.student_assignments
ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_student_assignments_course ON public.student_assignments(course_id);

-- 9. Create validate_course_code function
CREATE OR REPLACE FUNCTION public.validate_course_code(code text)
RETURNS TABLE(course_id uuid, instructor_id uuid, course_title text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.instructor_id, c.title
  FROM public.courses c
  WHERE c.course_code = code
    AND c.is_active = true
  LIMIT 1;
END;
$$;

-- 10. Create trigger for updated_at on courses
CREATE TRIGGER update_courses_updated_at
BEFORE UPDATE ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 11. Create trigger to set org_id from instructor's org
CREATE OR REPLACE FUNCTION public.set_course_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM profiles WHERE id = NEW.instructor_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_course_org_id_trigger
BEFORE INSERT ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.set_course_org_id();

-- 12. Migration: Create courses from existing instructor profiles
INSERT INTO public.courses (instructor_id, org_id, title, topics, schedule, course_type, course_code)
SELECT 
  p.id as instructor_id,
  p.org_id,
  COALESCE(p.course_title, 'My Course') as title,
  COALESCE(p.course_topics, '{}') as topics,
  p.course_schedule as schedule,
  COALESCE(p.professor_type::text, 'stem') as course_type,
  COALESCE(p.instructor_code, generate_course_code()) as course_code
FROM public.profiles p
INNER JOIN public.user_roles ur ON p.id = ur.user_id
WHERE ur.role = 'instructor'
  AND p.instructor_code IS NOT NULL
ON CONFLICT (course_code) DO NOTHING;

-- 13. Link existing instructor_students to migrated courses
UPDATE public.instructor_students is_row
SET course_id = (
  SELECT c.id 
  FROM public.courses c
  WHERE c.instructor_id = is_row.instructor_id
  ORDER BY c.created_at ASC
  LIMIT 1
)
WHERE is_row.course_id IS NULL;

-- 14. Link existing lecture_materials to migrated courses
UPDATE public.lecture_materials lm
SET course_id = (
  SELECT c.id 
  FROM public.courses c
  WHERE c.instructor_id = lm.instructor_id
  ORDER BY c.created_at ASC
  LIMIT 1
)
WHERE lm.course_id IS NULL;

-- 15. Link existing lecture_videos to migrated courses
UPDATE public.lecture_videos lv
SET course_id = (
  SELECT c.id 
  FROM public.courses c
  WHERE c.instructor_id = lv.instructor_id
  ORDER BY c.created_at ASC
  LIMIT 1
)
WHERE lv.course_id IS NULL;

-- 16. Link existing instructor_answer_keys to migrated courses
UPDATE public.instructor_answer_keys ak
SET course_id = (
  SELECT c.id 
  FROM public.courses c
  WHERE c.instructor_id = ak.instructor_id
  ORDER BY c.created_at ASC
  LIMIT 1
)
WHERE ak.course_id IS NULL;

-- 17. Link existing lecture_questions to migrated courses
UPDATE public.lecture_questions lq
SET course_id = (
  SELECT c.id 
  FROM public.courses c
  WHERE c.instructor_id = lq.instructor_id
  ORDER BY c.created_at ASC
  LIMIT 1
)
WHERE lq.course_id IS NULL;

-- 18. Link existing live_sessions to migrated courses  
UPDATE public.live_sessions ls
SET course_id = (
  SELECT c.id 
  FROM public.courses c
  WHERE c.instructor_id = ls.instructor_id
  ORDER BY c.created_at ASC
  LIMIT 1
)
WHERE ls.course_id IS NULL;