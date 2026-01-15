-- Add confidence columns to live_responses table for live sessions
ALTER TABLE public.live_responses 
ADD COLUMN IF NOT EXISTS confidence_level text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS confidence_multiplier numeric DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS points_earned integer DEFAULT 0;