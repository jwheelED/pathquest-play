
CREATE TABLE public.scheduled_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  duration TEXT NOT NULL,
  expected_attendance INTEGER NOT NULL,
  tier TEXT NOT NULL,
  capacity_tier TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  join_method TEXT NOT NULL DEFAULT 'both',
  require_name BOOLEAN NOT NULL DEFAULT false,
  show_live_results BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'scheduled',
  session_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  org_id UUID REFERENCES public.organizations(id)
);

ALTER TABLE public.scheduled_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own events" ON public.scheduled_events
  FOR SELECT TO authenticated USING (organizer_id = auth.uid());

CREATE POLICY "Users can insert own events" ON public.scheduled_events
  FOR INSERT TO authenticated WITH CHECK (organizer_id = auth.uid());

CREATE POLICY "Users can update own events" ON public.scheduled_events
  FOR UPDATE TO authenticated USING (organizer_id = auth.uid());

-- Trigger to auto-generate session code
CREATE OR REPLACE FUNCTION public.set_event_session_code()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.session_code IS NULL OR NEW.session_code = '' THEN
    LOOP
      NEW.session_code := generate_session_code();
      IF NOT EXISTS (
        SELECT 1 FROM scheduled_events
        WHERE session_code = NEW.session_code
        AND id != NEW.id
      ) THEN
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_event_session_code_trigger
  BEFORE INSERT ON public.scheduled_events
  FOR EACH ROW EXECUTE FUNCTION public.set_event_session_code();

-- Validation trigger instead of CHECK constraints
CREATE OR REPLACE FUNCTION public.validate_scheduled_event()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.duration NOT IN ('1_hour', '2_hours', '4_hours', 'full_day') THEN
    RAISE EXCEPTION 'Invalid duration value';
  END IF;
  IF NEW.tier NOT IN ('self-serve', 'premium') THEN
    RAISE EXCEPTION 'Invalid tier value';
  END IF;
  IF NEW.join_method NOT IN ('qr_only', 'code_only', 'both') THEN
    RAISE EXCEPTION 'Invalid join_method value';
  END IF;
  IF NEW.status NOT IN ('scheduled', 'ready', 'live', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status value';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_scheduled_event_trigger
  BEFORE INSERT OR UPDATE ON public.scheduled_events
  FOR EACH ROW EXECUTE FUNCTION public.validate_scheduled_event();
