-- Fix handle_new_instructor function to remove role column reference
CREATE OR REPLACE FUNCTION public.handle_new_instructor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only create profile if role is instructor
  IF NEW.raw_user_meta_data->>'role' = 'instructor' THEN
    INSERT INTO public.profiles (id, full_name, onboarded, instructor_code)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'full_name',
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
$function$;