-- Add manual_grade option to assignment_mode enum for short answer questions
ALTER TYPE public.assignment_mode ADD VALUE IF NOT EXISTS 'manual_grade';