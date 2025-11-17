-- Create professor_type enum
CREATE TYPE public.professor_type AS ENUM ('stem', 'humanities');

-- Add professor_type column to profiles table
ALTER TABLE public.profiles
ADD COLUMN professor_type public.professor_type DEFAULT NULL;