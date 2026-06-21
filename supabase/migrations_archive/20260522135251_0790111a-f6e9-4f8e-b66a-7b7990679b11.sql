-- Fix handle_new_user: new instructors/admins should start with onboarded=false
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role TEXT;
BEGIN
  v_role := NEW.raw_user_meta_data->>'role';

  IF v_role = 'instructor' THEN
    INSERT INTO public.profiles (id, full_name, onboarded, instructor_code)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Instructor'),
      false,
      generate_instructor_code()
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'instructor'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.users (id, user_id, name, email)
    VALUES (
      NEW.id,
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Instructor'),
      COALESCE(NEW.email, '')
    )
    ON CONFLICT (id) DO NOTHING;

  ELSIF v_role = 'admin' THEN
    INSERT INTO public.profiles (id, full_name, onboarded)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Admin'),
      false
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.users (id, user_id, name, email)
    VALUES (
      NEW.id,
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Admin'),
      COALESCE(NEW.email, '')
    )
    ON CONFLICT (id) DO NOTHING;

  ELSE
    INSERT INTO public.profiles (id, full_name, onboarded)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Student'),
      false
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'student'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: any instructor with onboarded=true but no active course should redo onboarding
UPDATE public.profiles p
SET onboarded = false
WHERE p.onboarded = true
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = 'instructor'::app_role
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.instructor_id = p.id AND c.is_active = true
  );