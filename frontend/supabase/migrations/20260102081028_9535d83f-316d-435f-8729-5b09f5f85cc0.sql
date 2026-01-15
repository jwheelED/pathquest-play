-- Create organization_domains table for email domain matching
CREATE TABLE public.organization_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  UNIQUE(org_id, domain)
);

-- Enable RLS
ALTER TABLE public.organization_domains ENABLE ROW LEVEL SECURITY;

-- Admins can manage domains for their org
CREATE POLICY "Admins manage org domains"
ON public.organization_domains
FOR ALL
USING (
  has_role(auth.uid(), 'admin') 
  AND org_id = get_user_org_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'admin') 
  AND org_id = get_user_org_id(auth.uid())
);

-- Create instructor_invites table for direct invites
CREATE TABLE public.instructor_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by UUID REFERENCES public.profiles(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, email)
);

-- Enable RLS
ALTER TABLE public.instructor_invites ENABLE ROW LEVEL SECURITY;

-- Admins can manage invites for their org
CREATE POLICY "Admins manage org invites"
ON public.instructor_invites
FOR ALL
USING (
  has_role(auth.uid(), 'admin') 
  AND org_id = get_user_org_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'admin') 
  AND org_id = get_user_org_id(auth.uid())
);

-- Anyone can check if their email has a pending invite (for signup flow)
CREATE POLICY "Users can check own invites"
ON public.instructor_invites
FOR SELECT
USING (
  lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
);

-- Function to auto-connect instructor to org on signup/profile update
CREATE OR REPLACE FUNCTION public.auto_connect_instructor_to_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email TEXT;
  v_email_domain TEXT;
  v_matched_org_id UUID;
  v_admin_id UUID;
  v_invite_org_id UUID;
BEGIN
  -- Only process if user is an instructor and not already connected to an org
  IF NOT has_role(NEW.id, 'instructor') THEN
    RETURN NEW;
  END IF;
  
  -- Skip if already has org_id
  IF NEW.org_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get user email
  SELECT email INTO v_user_email FROM auth.users WHERE id = NEW.id;
  
  IF v_user_email IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Extract domain from email
  v_email_domain := lower(split_part(v_user_email, '@', 2));
  
  -- First check for pending invite
  SELECT org_id INTO v_invite_org_id
  FROM instructor_invites
  WHERE lower(email) = lower(v_user_email)
    AND status = 'pending'
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;
  
  IF v_invite_org_id IS NOT NULL THEN
    -- Found a pending invite - connect to that org
    NEW.org_id := v_invite_org_id;
    
    -- Mark invite as accepted
    UPDATE instructor_invites
    SET status = 'accepted', accepted_at = now()
    WHERE org_id = v_invite_org_id AND lower(email) = lower(v_user_email);
    
    -- Find an admin from this org to create the connection
    SELECT p.id INTO v_admin_id
    FROM profiles p
    WHERE p.org_id = v_invite_org_id
      AND has_role(p.id, 'admin')
    LIMIT 1;
    
    IF v_admin_id IS NOT NULL THEN
      INSERT INTO admin_instructors (admin_id, instructor_id, org_id)
      VALUES (v_admin_id, NEW.id, v_invite_org_id)
      ON CONFLICT (admin_id, instructor_id) DO NOTHING;
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Check for email domain match
  SELECT od.org_id INTO v_matched_org_id
  FROM organization_domains od
  WHERE lower(od.domain) = v_email_domain
  LIMIT 1;
  
  IF v_matched_org_id IS NOT NULL THEN
    -- Found a matching domain - connect to that org
    NEW.org_id := v_matched_org_id;
    
    -- Find an admin from this org to create the connection
    SELECT p.id INTO v_admin_id
    FROM profiles p
    WHERE p.org_id = v_matched_org_id
      AND has_role(p.id, 'admin')
    LIMIT 1;
    
    IF v_admin_id IS NOT NULL THEN
      INSERT INTO admin_instructors (admin_id, instructor_id, org_id)
      VALUES (v_admin_id, NEW.id, v_matched_org_id)
      ON CONFLICT (admin_id, instructor_id) DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on profiles for auto-connect
CREATE TRIGGER auto_connect_instructor_on_profile_update
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_connect_instructor_to_org();

-- Function to auto-connect on seat allocation
CREATE OR REPLACE FUNCTION public.auto_connect_on_seat_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_admin_id UUID;
BEGIN
  -- Get org_id from the subscription
  SELECT s.org_id INTO v_org_id
  FROM seat_licenses sl
  JOIN subscriptions s ON s.id = sl.subscription_id
  WHERE sl.id = NEW.seat_license_id;
  
  IF v_org_id IS NOT NULL THEN
    -- Update instructor's org_id
    UPDATE profiles
    SET org_id = v_org_id
    WHERE id = NEW.instructor_id AND org_id IS NULL;
    
    -- Find an admin and create connection
    SELECT p.id INTO v_admin_id
    FROM profiles p
    WHERE p.org_id = v_org_id
      AND has_role(p.id, 'admin')
    LIMIT 1;
    
    IF v_admin_id IS NOT NULL THEN
      INSERT INTO admin_instructors (admin_id, instructor_id, org_id)
      VALUES (v_admin_id, NEW.instructor_id, v_org_id)
      ON CONFLICT (admin_id, instructor_id) DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on seat_allocations for auto-connect
CREATE TRIGGER auto_connect_on_seat_allocation_insert
  AFTER INSERT ON public.seat_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_connect_on_seat_allocation();