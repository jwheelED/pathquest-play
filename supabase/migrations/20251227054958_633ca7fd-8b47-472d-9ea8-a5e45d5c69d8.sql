-- =============================================
-- PHASE 1: Pricing System Database Schema
-- =============================================

-- 1. Subscription Tiers (reference data)
CREATE TABLE public.subscription_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- 'free', 'instructor', 'institutional'
  display_name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  billing_period TEXT NOT NULL DEFAULT 'semester',
  student_limit INTEGER, -- NULL = unlimited
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Subscriptions (user or org level)
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  tier_id UUID REFERENCES public.subscription_tiers(id) NOT NULL,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscription_scope CHECK (
    (user_id IS NOT NULL AND org_id IS NULL) OR 
    (user_id IS NULL AND org_id IS NOT NULL)
  ),
  CONSTRAINT valid_status CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired'))
);

-- 3. Seat Licenses (institutional)
CREATE TABLE public.seat_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE CASCADE NOT NULL,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  total_seats INTEGER NOT NULL,
  used_seats INTEGER NOT NULL DEFAULT 0,
  price_per_seat_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT positive_seats CHECK (total_seats > 0),
  CONSTRAINT used_not_exceed_total CHECK (used_seats <= total_seats)
);

-- 4. Seat Allocations (instructor assignments)
CREATE TABLE public.seat_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_license_id UUID REFERENCES public.seat_licenses(id) ON DELETE CASCADE NOT NULL,
  instructor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  allocated_seats INTEGER NOT NULL DEFAULT 1,
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  allocated_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  UNIQUE(seat_license_id, instructor_id),
  CONSTRAINT positive_allocation CHECK (allocated_seats > 0)
);

-- 5. Pilot Rebates (instructor tier rebate tracking)
CREATE TABLE public.pilot_rebates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE CASCADE NOT NULL,
  instructor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  original_amount_cents INTEGER NOT NULL,
  stripe_payment_intent_id TEXT NOT NULL,
  eligible_until TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'eligible',
  claimed_at TIMESTAMPTZ,
  refund_amount_cents INTEGER,
  institutional_subscription_id UUID REFERENCES public.subscriptions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_rebate_status CHECK (status IN ('eligible', 'claimed', 'expired', 'processing'))
);

-- 6. Usage Records (metering)
CREATE TABLE public.usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  metric_type TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  usage_limit INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT usage_scope CHECK (
    (user_id IS NOT NULL AND org_id IS NULL) OR 
    (user_id IS NULL AND org_id IS NOT NULL)
  ),
  CONSTRAINT valid_metric_type CHECK (metric_type IN ('active_students', 'ai_questions', 'video_minutes', 'lectures_created')),
  UNIQUE(user_id, org_id, period_start, metric_type)
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_subscriptions_org_id ON public.subscriptions(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_subscriptions_stripe_id ON public.subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX idx_seat_licenses_org_id ON public.seat_licenses(org_id);
CREATE INDEX idx_seat_allocations_instructor ON public.seat_allocations(instructor_id);
CREATE INDEX idx_pilot_rebates_status ON public.pilot_rebates(status);
CREATE INDEX idx_pilot_rebates_instructor ON public.pilot_rebates(instructor_id);
CREATE INDEX idx_usage_records_user_period ON public.usage_records(user_id, period_start) WHERE user_id IS NOT NULL;
CREATE INDEX idx_usage_records_org_period ON public.usage_records(org_id, period_start) WHERE org_id IS NOT NULL;

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Get user's current subscription tier name
CREATE OR REPLACE FUNCTION public.get_user_subscription_tier(_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- First check direct user subscription
    (SELECT st.name 
     FROM subscriptions s
     JOIN subscription_tiers st ON st.id = s.tier_id
     WHERE s.user_id = _user_id 
       AND s.status = 'active'
       AND s.current_period_end > now()
     ORDER BY st.sort_order DESC
     LIMIT 1),
    -- Then check org subscription via seat allocation
    (SELECT st.name
     FROM seat_allocations sa
     JOIN seat_licenses sl ON sl.id = sa.seat_license_id
     JOIN subscriptions s ON s.id = sl.subscription_id
     JOIN subscription_tiers st ON st.id = s.tier_id
     WHERE sa.instructor_id = _user_id
       AND s.status = 'active'
       AND s.current_period_end > now()
     LIMIT 1),
    -- Default to free
    'free'
  );
$$;

-- Check if user has access to a specific feature
CREATE OR REPLACE FUNCTION public.has_feature_access(_user_id UUID, _feature TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tier_features JSONB;
BEGIN
  -- Get user's tier features
  SELECT st.features INTO tier_features
  FROM subscriptions s
  JOIN subscription_tiers st ON st.id = s.tier_id
  WHERE (s.user_id = _user_id OR s.org_id = get_user_org_id(_user_id))
    AND s.status = 'active'
    AND s.current_period_end > now()
  ORDER BY st.sort_order DESC
  LIMIT 1;
  
  -- Check if feature is in the features array
  IF tier_features IS NOT NULL THEN
    RETURN tier_features ? _feature;
  END IF;
  
  -- Check free tier features
  SELECT features INTO tier_features
  FROM subscription_tiers
  WHERE name = 'free';
  
  RETURN COALESCE(tier_features ? _feature, false);
END;
$$;

-- Get user's student limit
CREATE OR REPLACE FUNCTION public.get_student_limit(_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT st.student_limit
     FROM subscriptions s
     JOIN subscription_tiers st ON st.id = s.tier_id
     WHERE (s.user_id = _user_id OR s.org_id = get_user_org_id(_user_id))
       AND s.status = 'active'
       AND s.current_period_end > now()
     ORDER BY st.student_limit DESC NULLS FIRST
     LIMIT 1),
    25 -- Free tier default
  );
$$;

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

-- Subscription Tiers (public read)
ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active tiers"
ON public.subscription_tiers FOR SELECT
USING (is_active = true);

-- Subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscription"
ON public.subscriptions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can view their org subscription"
ON public.subscriptions FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage org subscriptions"
ON public.subscriptions FOR ALL
USING (
  has_role(auth.uid(), 'admin') 
  AND org_id = get_user_org_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'admin') 
  AND org_id = get_user_org_id(auth.uid())
);

-- Seat Licenses
ALTER TABLE public.seat_licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view seat licenses"
ON public.seat_licenses FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage seat licenses"
ON public.seat_licenses FOR ALL
USING (
  has_role(auth.uid(), 'admin') 
  AND org_id = get_user_org_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'admin') 
  AND org_id = get_user_org_id(auth.uid())
);

-- Seat Allocations
ALTER TABLE public.seat_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors can view their allocations"
ON public.seat_allocations FOR SELECT
USING (instructor_id = auth.uid());

CREATE POLICY "Admins can view org allocations"
ON public.seat_allocations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM seat_licenses sl
    WHERE sl.id = seat_allocations.seat_license_id
      AND sl.org_id = get_user_org_id(auth.uid())
  )
);

CREATE POLICY "Admins can manage org allocations"
ON public.seat_allocations FOR ALL
USING (
  has_role(auth.uid(), 'admin') 
  AND EXISTS (
    SELECT 1 FROM seat_licenses sl
    WHERE sl.id = seat_allocations.seat_license_id
      AND sl.org_id = get_user_org_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin') 
  AND EXISTS (
    SELECT 1 FROM seat_licenses sl
    WHERE sl.id = seat_allocations.seat_license_id
      AND sl.org_id = get_user_org_id(auth.uid())
  )
);

-- Pilot Rebates
ALTER TABLE public.pilot_rebates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors can view their rebates"
ON public.pilot_rebates FOR SELECT
USING (instructor_id = auth.uid());

CREATE POLICY "Admins can view org rebates"
ON public.pilot_rebates FOR SELECT
USING (
  has_role(auth.uid(), 'admin')
  AND EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.id = pilot_rebates.subscription_id
      AND (s.org_id = get_user_org_id(auth.uid()) 
           OR EXISTS (
             SELECT 1 FROM profiles p 
             WHERE p.id = pilot_rebates.instructor_id 
               AND p.org_id = get_user_org_id(auth.uid())
           ))
  )
);

-- Usage Records
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their usage"
ON public.usage_records FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can manage their usage"
ON public.usage_records FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view org usage"
ON public.usage_records FOR SELECT
USING (
  has_role(auth.uid(), 'admin') 
  AND org_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Admins can manage org usage"
ON public.usage_records FOR ALL
USING (
  has_role(auth.uid(), 'admin') 
  AND org_id = get_user_org_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'admin') 
  AND org_id = get_user_org_id(auth.uid())
);

-- =============================================
-- TRIGGERS
-- =============================================

-- Update updated_at timestamp
CREATE TRIGGER update_subscription_tiers_updated_at
  BEFORE UPDATE ON public.subscription_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_seat_licenses_updated_at
  BEFORE UPDATE ON public.seat_licenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pilot_rebates_updated_at
  BEFORE UPDATE ON public.pilot_rebates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_usage_records_updated_at
  BEFORE UPDATE ON public.usage_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- SEED DATA: Subscription Tiers
-- =============================================
INSERT INTO public.subscription_tiers (name, display_name, description, price_cents, billing_period, student_limit, features, sort_order) VALUES
(
  'free',
  'Free',
  'Get started with Edvana basics',
  0,
  'semester',
  25,
  '["live_lecture", "basic_questions", "manual_codes", "basic_analytics"]'::jsonb,
  0
),
(
  'instructor',
  'Instructor',
  'Full access for individual instructors with pilot rebate guarantee',
  14900,
  'semester',
  NULL,
  '["live_lecture", "ai_questions", "auto_grading", "academic_integrity", "full_analytics", "study_paths", "unlimited_lectures", "email_support", "pilot_rebate"]'::jsonb,
  1
),
(
  'institutional',
  'Institutional',
  'Enterprise features with SSO, LMS integration, and org-wide analytics',
  0,
  'semester',
  NULL,
  '["live_lecture", "ai_questions", "auto_grading", "academic_integrity", "full_analytics", "study_paths", "unlimited_lectures", "sso_saml", "lti_lms", "auto_grade_sync", "admin_dashboard", "org_analytics", "priority_support"]'::jsonb,
  2
);