-- Add admin_code to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admin_code TEXT UNIQUE;

-- Create function to generate admin codes
CREATE OR REPLACE FUNCTION public.generate_admin_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN 'ADM-' || result;
END;
$$;

-- Create trigger function to auto-generate admin codes
CREATE OR REPLACE FUNCTION public.set_admin_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only generate code if user is admin and code is null
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = NEW.id AND role = 'admin'::app_role
  ) AND (NEW.admin_code IS NULL OR NEW.admin_code = '') THEN
    -- Keep generating until we get a unique code
    LOOP
      NEW.admin_code := generate_admin_code();
      -- Check if this code already exists
      IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE admin_code = NEW.admin_code 
        AND id != NEW.id
      ) THEN
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on profiles
DROP TRIGGER IF EXISTS set_admin_code_trigger ON public.profiles;
CREATE TRIGGER set_admin_code_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_admin_code();

-- Backfill admin codes for existing admins
DO $$
DECLARE
  admin_record RECORD;
  new_code TEXT;
BEGIN
  FOR admin_record IN 
    SELECT p.id 
    FROM public.profiles p
    INNER JOIN public.user_roles ur ON p.id = ur.user_id
    WHERE ur.role = 'admin'::app_role 
    AND (p.admin_code IS NULL OR p.admin_code = '')
  LOOP
    -- Generate unique code
    LOOP
      new_code := generate_admin_code();
      IF NOT EXISTS (SELECT 1 FROM profiles WHERE admin_code = new_code) THEN
        EXIT;
      END IF;
    END LOOP;
    
    UPDATE public.profiles
    SET admin_code = new_code
    WHERE id = admin_record.id;
  END LOOP;
END;
$$;

-- Create connect_instructor_to_admin function
CREATE OR REPLACE FUNCTION public.connect_instructor_to_admin(_admin_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
  v_instructor_id UUID;
  v_org_id UUID;
BEGIN
  -- Get current user (instructor)
  v_instructor_id := auth.uid();
  
  -- Verify user is an instructor
  IF NOT has_role(v_instructor_id, 'instructor') THEN
    RAISE EXCEPTION 'Only instructors can connect to admins';
  END IF;
  
  -- Find admin by code
  SELECT id, org_id INTO v_admin_id, v_org_id
  FROM profiles
  WHERE admin_code = _admin_code;
  
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Invalid admin code';
  END IF;
  
  -- Verify the user is actually an admin
  IF NOT has_role(v_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Code does not belong to an admin';
  END IF;
  
  -- Verify admin has an org_id
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Admin is not connected to an organization';
  END IF;
  
  -- Update instructor's org_id
  UPDATE profiles
  SET org_id = v_org_id
  WHERE id = v_instructor_id;
  
  -- Insert connection (ON CONFLICT DO NOTHING to handle duplicates)
  INSERT INTO admin_instructors (admin_id, instructor_id, org_id)
  VALUES (v_admin_id, v_instructor_id, v_org_id)
  ON CONFLICT (admin_id, instructor_id) DO NOTHING;
  
  RETURN v_admin_id;
END;
$$;

-- Drop old function
DROP FUNCTION IF EXISTS public.add_instructor_for_admin(TEXT);