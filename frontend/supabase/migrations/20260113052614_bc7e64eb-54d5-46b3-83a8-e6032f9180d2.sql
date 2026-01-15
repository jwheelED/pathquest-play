-- Add stripe_price_id column to subscription_tiers
ALTER TABLE public.subscription_tiers 
ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

-- Add course_limit column to subscription_tiers (for limiting courses on free tier)
ALTER TABLE public.subscription_tiers 
ADD COLUMN IF NOT EXISTS course_limit INTEGER;

-- Update existing tiers with Stripe price IDs and course limits
UPDATE public.subscription_tiers 
SET stripe_price_id = 'price_1SozBIL88sjmY9hilAFEJrTS',
    course_limit = NULL -- Unlimited for paid tier
WHERE name = 'instructor';

UPDATE public.subscription_tiers 
SET stripe_price_id = 'price_1SozMfL88sjmY9hiZqrgqPi6',
    course_limit = NULL -- Unlimited for institutional
WHERE name = 'institutional';

UPDATE public.subscription_tiers 
SET course_limit = 1 -- Free tier limited to 1 course
WHERE name = 'free';

-- Create function to get course limit for a user
CREATE OR REPLACE FUNCTION public.get_user_course_limit(_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT st.course_limit
     FROM subscriptions s
     JOIN subscription_tiers st ON st.id = s.tier_id
     WHERE (s.user_id = _user_id OR s.org_id = get_user_org_id(_user_id))
       AND s.status = 'active'
       AND s.current_period_end > now()
     ORDER BY st.course_limit DESC NULLS FIRST
     LIMIT 1),
    1 -- Free tier default: 1 course
  );
$$;