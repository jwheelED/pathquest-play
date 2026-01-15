-- Function to generate a random 6-character class code
CREATE OR REPLACE FUNCTION generate_instructor_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Trigger function to set instructor code when role is instructor
CREATE OR REPLACE FUNCTION set_instructor_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only generate code if role is instructor and code is null
  IF NEW.role = 'instructor' AND (NEW.instructor_code IS NULL OR NEW.instructor_code = '') THEN
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

-- Create trigger for new profiles
DROP TRIGGER IF EXISTS trigger_set_instructor_code ON profiles;
CREATE TRIGGER trigger_set_instructor_code
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_instructor_code();

-- Add RLS policy to allow students to find instructors by code
CREATE POLICY "Anyone can view instructor codes"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (role = 'instructor');

-- Generate codes for existing instructors who don't have one
UPDATE profiles
SET instructor_code = generate_instructor_code()
WHERE role = 'instructor' 
  AND (instructor_code IS NULL OR instructor_code = '');
