-- Generate instructor codes for existing instructors who don't have one
UPDATE public.profiles
SET instructor_code = upper(substring(md5(random()::text || id::text) from 1 for 6))
WHERE role = 'instructor' 
AND (instructor_code IS NULL OR instructor_code = '');