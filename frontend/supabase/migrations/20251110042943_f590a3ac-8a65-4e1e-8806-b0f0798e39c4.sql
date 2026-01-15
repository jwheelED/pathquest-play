-- Fix for students whose onboarding was reset
-- Re-enable onboarding for students who are connected to instructors
-- This prevents student dashboard crashes after instructor re-onboarding

UPDATE profiles
SET onboarded = true
WHERE id IN (
  SELECT DISTINCT student_id 
  FROM instructor_students
)
AND onboarded = false;