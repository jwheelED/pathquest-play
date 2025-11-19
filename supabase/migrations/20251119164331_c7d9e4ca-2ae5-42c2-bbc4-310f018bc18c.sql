-- Add AI model configuration fields for detection, transcription, generation, and interval questions
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS detection_model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
ADD COLUMN IF NOT EXISTS transcription_model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
ADD COLUMN IF NOT EXISTS generation_model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
ADD COLUMN IF NOT EXISTS interval_question_model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash';