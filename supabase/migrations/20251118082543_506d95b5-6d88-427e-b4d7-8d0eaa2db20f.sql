-- Migration to assign existing data to default organization

-- Create default organization
INSERT INTO public.organizations (
  id,
  name,
  slug,
  admin_code,
  instructor_invite_code,
  created_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Default Organization',
  'default',
  (SELECT generate_admin_code()),
  (SELECT generate_org_invite_code()),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Update all existing profiles to belong to default org
UPDATE public.profiles
SET org_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE org_id IS NULL;

-- Update all existing instructor_students records
UPDATE public.instructor_students
SET org_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE org_id IS NULL;

-- Update all existing student_assignments records
UPDATE public.student_assignments
SET org_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE org_id IS NULL;

-- Update all existing user_stats records
UPDATE public.user_stats
SET org_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE org_id IS NULL;

-- Update all existing lesson_progress records
UPDATE public.lesson_progress
SET org_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE org_id IS NULL;

-- Update all existing user_achievements records
UPDATE public.user_achievements
SET org_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE org_id IS NULL;

-- Update all existing lecture_materials records
UPDATE public.lecture_materials
SET org_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE org_id IS NULL;

-- Update all existing lecture_questions records
UPDATE public.lecture_questions
SET org_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE org_id IS NULL;

-- Update all existing content_drafts records
UPDATE public.content_drafts
SET org_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE org_id IS NULL;

-- Update all existing messages records
UPDATE public.messages
SET org_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE org_id IS NULL;

-- Update all existing lesson_mastery records (if they need org_id)
-- Note: lesson_mastery table doesn't have org_id yet, but adding for completeness
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'lesson_mastery' 
    AND column_name = 'org_id'
  ) THEN
    EXECUTE 'UPDATE public.lesson_mastery SET org_id = ''00000000-0000-0000-0000-000000000001''::uuid WHERE org_id IS NULL';
  END IF;
END $$;

-- Update all existing problem_attempts records (if they need org_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'problem_attempts' 
    AND column_name = 'org_id'
  ) THEN
    EXECUTE 'UPDATE public.problem_attempts SET org_id = ''00000000-0000-0000-0000-000000000001''::uuid WHERE org_id IS NULL';
  END IF;
END $$;

-- Update all existing checkin_streaks records (if they need org_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'checkin_streaks' 
    AND column_name = 'org_id'
  ) THEN
    EXECUTE 'UPDATE public.checkin_streaks SET org_id = ''00000000-0000-0000-0000-000000000001''::uuid WHERE org_id IS NULL';
  END IF;
END $$;

-- Ensure all instructors have instructor codes
UPDATE public.profiles
SET instructor_code = generate_instructor_code()
WHERE instructor_code IS NULL
AND id IN (
  SELECT user_id FROM public.user_roles WHERE role = 'instructor'::app_role
);

-- Log migration completion
DO $$
DECLARE
  profile_count INTEGER;
  assignment_count INTEGER;
  stats_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO profile_count FROM public.profiles WHERE org_id = '00000000-0000-0000-0000-000000000001'::uuid;
  SELECT COUNT(*) INTO assignment_count FROM public.student_assignments WHERE org_id = '00000000-0000-0000-0000-000000000001'::uuid;
  SELECT COUNT(*) INTO stats_count FROM public.user_stats WHERE org_id = '00000000-0000-0000-0000-000000000001'::uuid;
  
  RAISE NOTICE 'Migration complete: % profiles, % assignments, % user stats migrated to default organization', profile_count, assignment_count, stats_count;
END $$;