-- Add missing enum values for lecture check-ins and manual grading

-- Add lecture_checkin to assignment_type enum
ALTER TYPE public.assignment_type ADD VALUE IF NOT EXISTS 'lecture_checkin';

-- Add manual_grade to assignment_mode enum
ALTER TYPE public.assignment_mode ADD VALUE IF NOT EXISTS 'manual_grade';