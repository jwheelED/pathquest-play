-- Update handle_new_user to better handle OAuth sign-ups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Get role from metadata (set during email/password signup)
  v_role := NEW.raw_user_meta_data->>'role';
  
  -- Handle instructor role
  IF v_role = 'instructor' THEN
    INSERT INTO public.profiles (id, full_name, onboarded, instructor_code)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Instructor'),
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
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Instructor'), 
      COALESCE(NEW.email, '')
    )
    ON CONFLICT (id) DO NOTHING;
    
  -- Handle admin role  
  ELSIF v_role = 'admin' THEN
    INSERT INTO public.profiles (id, full_name, onboarded)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Admin'),
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
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Admin'), 
      COALESCE(NEW.email, '')
    )
    ON CONFLICT (id) DO NOTHING;
    
  -- Handle student role (default) - including OAuth sign-ups without role
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
$$;

-- Create a helper function to assign role after OAuth signup
-- This can be called from the client after OAuth callback for instructor/admin signups
CREATE OR REPLACE FUNCTION public.assign_oauth_role(p_user_id uuid, p_role app_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only allow if user has no role yet (new OAuth signup)
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role != 'student'::app_role
  ) THEN
    -- Remove student role if exists
    DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = 'student'::app_role;
    
    -- Insert new role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, p_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    
    -- Update profile for instructors
    IF p_role = 'instructor'::app_role THEN
      UPDATE public.profiles
      SET instructor_code = generate_instructor_code(),
          onboarded = true
      WHERE id = p_user_id;
      
      INSERT INTO public.users (id, user_id, name, email)
      SELECT p_user_id, p_user_id, full_name, (SELECT email FROM auth.users WHERE id = p_user_id)
      FROM public.profiles WHERE id = p_user_id
      ON CONFLICT (id) DO NOTHING;
    END IF;
    
    -- Update profile for admins
    IF p_role = 'admin'::app_role THEN
      UPDATE public.profiles
      SET onboarded = true
      WHERE id = p_user_id;
      
      INSERT INTO public.users (id, user_id, name, email)
      SELECT p_user_id, p_user_id, full_name, (SELECT email FROM auth.users WHERE id = p_user_id)
      FROM public.profiles WHERE id = p_user_id
      ON CONFLICT (id) DO NOTHING;
    END IF;
    
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;