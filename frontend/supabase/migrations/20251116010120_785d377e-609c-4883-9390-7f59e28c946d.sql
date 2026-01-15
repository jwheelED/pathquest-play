-- Add force send mode setting to profiles
ALTER TABLE public.profiles
ADD COLUMN auto_question_force_send BOOLEAN DEFAULT false;