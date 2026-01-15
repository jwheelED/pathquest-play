-- Update the handle_new_instructor trigger to also handle admin role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Handle instructor role
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
  -- Handle admin role  
  ELSIF NEW.raw_user_meta_data->>'role' = 'admin' THEN
    INSERT INTO public.profiles (id, full_name, role, onboarded)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'full_name',
      'admin',
      true
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
$function$;

-- Drop the old trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create new trigger with updated function
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();