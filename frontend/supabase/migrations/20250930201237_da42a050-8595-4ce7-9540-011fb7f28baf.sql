-- Add instructor_code column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN instructor_code text UNIQUE;

-- Create function to generate random instructor code
CREATE OR REPLACE FUNCTION public.generate_instructor_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  code text;
  code_exists boolean;
BEGIN
  LOOP
    -- Generate a random 6-character alphanumeric code
    code := upper(substring(md5(random()::text) from 1 for 6));
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE instructor_code = code) INTO code_exists;
    
    -- Exit loop if code is unique
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  RETURN code;
END;
$$;

-- Update the handle_new_instructor function to generate instructor code
CREATE OR REPLACE FUNCTION public.handle_new_instructor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only create profile if role is instructor
  IF NEW.raw_user_meta_data->>'role' = 'instructor' THEN
    INSERT INTO public.profiles (id, full_name, role, onboarded, instructor_code)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'full_name',
      'instructor',
      true,
      generate_instructor_code()
    );
    
    INSERT INTO public.users (id, user_id, name, email)
    VALUES (
      NEW.id,
      NEW.id,
      NEW.raw_user_meta_data->>'full_name',
      NEW.email
    );
  END IF;
  
  RETURN NEW;
END;
$$;