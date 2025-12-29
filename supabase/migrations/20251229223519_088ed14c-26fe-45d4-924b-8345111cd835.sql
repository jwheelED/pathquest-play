-- Create table to track instructor lecture minutes usage per month
CREATE TABLE public.instructor_usage_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instructor_id UUID NOT NULL,
  usage_month DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::DATE,
  minutes_used INTEGER NOT NULL DEFAULT 0,
  minutes_limit INTEGER NOT NULL DEFAULT 90,
  warning_75_sent BOOLEAN NOT NULL DEFAULT false,
  warning_100_sent BOOLEAN NOT NULL DEFAULT false,
  org_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(instructor_id, usage_month)
);

-- Enable RLS
ALTER TABLE public.instructor_usage_tracking ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Instructors view own usage"
  ON public.instructor_usage_tracking
  FOR SELECT
  USING (auth.uid() = instructor_id);

CREATE POLICY "Instructors update own usage"
  ON public.instructor_usage_tracking
  FOR UPDATE
  USING (auth.uid() = instructor_id);

CREATE POLICY "System can insert usage records"
  ON public.instructor_usage_tracking
  FOR INSERT
  WITH CHECK (auth.uid() = instructor_id);

CREATE POLICY "Admins view org usage"
  ON public.instructor_usage_tracking
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- Function to get or create current month's usage record
CREATE OR REPLACE FUNCTION public.get_current_usage(p_instructor_id UUID)
RETURNS TABLE(
  minutes_used INTEGER,
  minutes_limit INTEGER,
  usage_percent NUMERIC,
  warning_level TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_month DATE := date_trunc('month', CURRENT_DATE)::DATE;
  v_minutes_used INTEGER;
  v_minutes_limit INTEGER;
  v_usage_percent NUMERIC;
  v_org_id UUID;
BEGIN
  -- Get instructor's org_id
  SELECT profiles.org_id INTO v_org_id FROM profiles WHERE id = p_instructor_id;
  
  -- Insert record if not exists
  INSERT INTO instructor_usage_tracking (instructor_id, usage_month, org_id)
  VALUES (p_instructor_id, v_current_month, v_org_id)
  ON CONFLICT (instructor_id, usage_month) DO NOTHING;
  
  -- Get current usage
  SELECT iut.minutes_used, iut.minutes_limit
  INTO v_minutes_used, v_minutes_limit
  FROM instructor_usage_tracking iut
  WHERE iut.instructor_id = p_instructor_id AND iut.usage_month = v_current_month;
  
  v_usage_percent := ROUND((v_minutes_used::NUMERIC / NULLIF(v_minutes_limit, 0)) * 100, 1);
  
  RETURN QUERY SELECT 
    v_minutes_used,
    v_minutes_limit,
    v_usage_percent,
    CASE
      WHEN v_usage_percent >= 100 THEN 'limit_reached'
      WHEN v_usage_percent >= 75 THEN 'warning_75'
      ELSE 'ok'
    END;
END;
$$;

-- Function to add lecture minutes and return warning status
CREATE OR REPLACE FUNCTION public.add_lecture_minutes(
  p_instructor_id UUID,
  p_minutes INTEGER
)
RETURNS TABLE(
  new_total INTEGER,
  minutes_limit INTEGER,
  usage_percent NUMERIC,
  warning_level TEXT,
  warning_triggered BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_month DATE := date_trunc('month', CURRENT_DATE)::DATE;
  v_new_total INTEGER;
  v_limit INTEGER;
  v_usage_percent NUMERIC;
  v_warning_75_sent BOOLEAN;
  v_warning_100_sent BOOLEAN;
  v_warning_triggered BOOLEAN := false;
  v_org_id UUID;
BEGIN
  -- Get instructor's org_id
  SELECT profiles.org_id INTO v_org_id FROM profiles WHERE id = p_instructor_id;
  
  -- Upsert and increment minutes
  INSERT INTO instructor_usage_tracking (instructor_id, usage_month, minutes_used, org_id)
  VALUES (p_instructor_id, v_current_month, p_minutes, v_org_id)
  ON CONFLICT (instructor_id, usage_month) 
  DO UPDATE SET 
    minutes_used = instructor_usage_tracking.minutes_used + p_minutes,
    updated_at = now()
  RETURNING 
    instructor_usage_tracking.minutes_used, 
    instructor_usage_tracking.minutes_limit,
    instructor_usage_tracking.warning_75_sent,
    instructor_usage_tracking.warning_100_sent
  INTO v_new_total, v_limit, v_warning_75_sent, v_warning_100_sent;
  
  v_usage_percent := ROUND((v_new_total::NUMERIC / NULLIF(v_limit, 0)) * 100, 1);
  
  -- Check and update warning flags
  IF v_usage_percent >= 100 AND NOT v_warning_100_sent THEN
    UPDATE instructor_usage_tracking 
    SET warning_100_sent = true 
    WHERE instructor_id = p_instructor_id AND usage_month = v_current_month;
    v_warning_triggered := true;
  ELSIF v_usage_percent >= 75 AND NOT v_warning_75_sent THEN
    UPDATE instructor_usage_tracking 
    SET warning_75_sent = true 
    WHERE instructor_id = p_instructor_id AND usage_month = v_current_month;
    v_warning_triggered := true;
  END IF;
  
  RETURN QUERY SELECT 
    v_new_total,
    v_limit,
    v_usage_percent,
    CASE
      WHEN v_usage_percent >= 100 THEN 'limit_reached'
      WHEN v_usage_percent >= 75 THEN 'warning_75'
      ELSE 'ok'
    END,
    v_warning_triggered;
END;
$$;

-- Function to check if instructor can record (has minutes remaining)
CREATE OR REPLACE FUNCTION public.can_record_lecture(p_instructor_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage RECORD;
BEGIN
  SELECT * INTO v_usage FROM get_current_usage(p_instructor_id);
  RETURN v_usage.minutes_used < v_usage.minutes_limit;
END;
$$;

-- Add updated_at trigger
CREATE TRIGGER update_instructor_usage_tracking_updated_at
  BEFORE UPDATE ON public.instructor_usage_tracking
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_usage_tracking_instructor_month 
  ON public.instructor_usage_tracking(instructor_id, usage_month);