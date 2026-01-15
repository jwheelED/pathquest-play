-- Drop the redundant handle_new_instructor function with CASCADE
-- This will also drop the dependent trigger on_instructor_created
-- The handle_new_user function already handles instructor signups correctly

DROP FUNCTION IF EXISTS public.handle_new_instructor() CASCADE;