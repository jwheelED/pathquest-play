-- Create or replace function to handle new instructor signup
CREATE OR REPLACE FUNCTION public.handle_new_instructor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only create profile if role is instructor
  IF NEW.raw_user_meta_data->>'role' = 'instructor' THEN
    INSERT INTO public.profiles (id, full_name, role, onboarded)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'full_name',
      'instructor',
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
$$;

-- Create trigger for instructor signup
DROP TRIGGER IF EXISTS on_instructor_created ON auth.users;
CREATE TRIGGER on_instructor_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (NEW.raw_user_meta_data->>'role' = 'instructor')
  EXECUTE FUNCTION public.handle_new_instructor();