-- Fix validate_instructor_code function to use user_roles table
DROP FUNCTION IF EXISTS public.validate_instructor_code(text);

CREATE OR REPLACE FUNCTION public.validate_instructor_code(code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  instructor_user_id uuid;
BEGIN
  -- Find instructor by code and verify they have instructor role
  SELECT p.id INTO instructor_user_id
  FROM profiles p
  INNER JOIN user_roles ur ON p.id = ur.user_id
  WHERE p.instructor_code = code 
  AND ur.role = 'instructor'
  LIMIT 1;
  
  RETURN instructor_user_id;
END;
$$;