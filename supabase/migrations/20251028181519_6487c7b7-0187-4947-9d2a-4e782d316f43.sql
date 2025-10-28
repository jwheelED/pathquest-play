-- Fix handle_new_user to prevent duplicate key errors
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
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Instructor'),
      'instructor',
      true,
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
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Instructor'), 
      COALESCE(NEW.email, '')
    )
    ON CONFLICT (id) DO NOTHING;
    
  -- Handle admin role  
  ELSIF v_role = 'admin' THEN
    INSERT INTO public.profiles (id, full_name, role, onboarded)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Admin'),
      'admin',
      true
    )
    ON CONFLICT (id) DO NOTHING;
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    
    INSERT INTO public.users (id, user_id, name, email)
    VALUES (
      NEW.id, 
      NEW.id, 
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Admin'), 
      COALESCE(NEW.email, '')
    )
    ON CONFLICT (id) DO NOTHING;
    
  -- Handle student role (default)
  ELSE
    INSERT INTO public.profiles (id, full_name, role, onboarded)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Student'),
      'student',
      false
    )
    ON CONFLICT (id) DO NOTHING;
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'student'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;