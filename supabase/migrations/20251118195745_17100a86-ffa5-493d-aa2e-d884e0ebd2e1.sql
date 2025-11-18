-- Create a function to sync org_id when student joins or switches classes
CREATE OR REPLACE FUNCTION sync_student_org_id()
RETURNS TRIGGER AS $$
DECLARE
  instructor_org uuid;
BEGIN
  -- Get instructor's org_id
  SELECT org_id INTO instructor_org
  FROM profiles
  WHERE id = NEW.instructor_id;
  
  -- Set org_id on the instructor_students record
  NEW.org_id := instructor_org;
  
  -- Also update the student's profile with the same org_id
  UPDATE profiles
  SET org_id = instructor_org
  WHERE id = NEW.student_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to automatically sync org_id when student joins a class
DROP TRIGGER IF EXISTS sync_student_org_on_connection ON instructor_students;
CREATE TRIGGER sync_student_org_on_connection
  BEFORE INSERT OR UPDATE ON instructor_students
  FOR EACH ROW
  EXECUTE FUNCTION sync_student_org_id();

-- Fix existing data: Update all students' org_ids to match their instructor's org_id
UPDATE profiles p
SET org_id = (
  SELECT i_p.org_id
  FROM instructor_students i_s
  JOIN profiles i_p ON i_s.instructor_id = i_p.id
  WHERE i_s.student_id = p.id
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM instructor_students WHERE student_id = p.id
) AND p.org_id IS NULL;

-- Fix existing instructor_students records
UPDATE instructor_students i_s
SET org_id = (
  SELECT org_id
  FROM profiles
  WHERE id = i_s.instructor_id
)
WHERE i_s.org_id IS NULL;