-- Drop the old trigger and function that reference the dropped role column
DROP FUNCTION IF EXISTS public.set_instructor_code() CASCADE;

-- Create new trigger function that uses user_roles table
CREATE OR REPLACE FUNCTION public.set_instructor_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only generate code if user is instructor and code is null
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = NEW.id AND role = 'instructor'::app_role
  ) AND (NEW.instructor_code IS NULL OR NEW.instructor_code = '') THEN
    -- Keep generating until we get a unique code
    LOOP
      NEW.instructor_code := generate_instructor_code();
      -- Check if this code already exists
      IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE instructor_code = NEW.instructor_code 
        AND id != NEW.id
      ) THEN
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER trigger_set_instructor_code
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_instructor_code();

-- Now reset student onboarding status and clear learning path data
UPDATE public.profiles
SET 
  onboarded = false,
  goals = NULL,
  experience_level = NULL,
  study_days = NULL
WHERE id IN (
  SELECT user_id 
  FROM public.user_roles 
  WHERE role = 'student'::app_role
);

-- Delete all student lessons (learning paths)
DELETE FROM public.lessons
WHERE user_id IN (
  SELECT user_id 
  FROM public.user_roles 
  WHERE role = 'student'::app_role
);