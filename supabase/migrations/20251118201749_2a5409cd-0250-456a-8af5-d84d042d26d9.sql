-- Function: set org_id for student_assignments based on instructor's org
CREATE OR REPLACE FUNCTION set_student_assignment_org_id()
RETURNS TRIGGER AS $$
DECLARE
  instructor_org uuid;
BEGIN
  -- Only set it if it's not already provided
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO instructor_org
    FROM profiles
    WHERE id = NEW.instructor_id;

    NEW.org_id := instructor_org;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger: run before INSERT or UPDATE
DROP TRIGGER IF EXISTS set_student_assignment_org ON student_assignments;
CREATE TRIGGER set_student_assignment_org
  BEFORE INSERT OR UPDATE ON student_assignments
  FOR EACH ROW
  EXECUTE FUNCTION set_student_assignment_org_id();

-- Backfill existing student_assignments.org_id from instructor profiles
UPDATE student_assignments sa
SET org_id = p.org_id
FROM profiles p
WHERE sa.instructor_id = p.id
  AND sa.org_id IS NULL
  AND p.org_id IS NOT NULL;