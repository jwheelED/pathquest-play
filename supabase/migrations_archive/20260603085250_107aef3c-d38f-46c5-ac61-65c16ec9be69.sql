
-- Backfill admin_instructors for existing org members
INSERT INTO public.admin_instructors (admin_id, instructor_id, org_id)
SELECT a.id, i.id, a.org_id
FROM public.profiles a
JOIN public.user_roles ar ON ar.user_id = a.id AND ar.role = 'admin'
JOIN public.profiles i ON i.org_id = a.org_id AND i.id <> a.id
JOIN public.user_roles ir ON ir.user_id = i.id AND ir.role = 'instructor'
WHERE a.org_id IS NOT NULL
ON CONFLICT (admin_id, instructor_id) DO NOTHING;

-- Update auto_connect_instructor_to_org: fan out to all admins; also handle case where role exists only at UPDATE time
CREATE OR REPLACE FUNCTION public.auto_connect_instructor_to_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_email TEXT;
  v_email_domain TEXT;
  v_matched_org_id UUID;
  v_invite_org_id UUID;
BEGIN
  IF NOT has_role(NEW.id, 'instructor') THEN
    RETURN NEW;
  END IF;

  IF NEW.org_id IS NOT NULL THEN
    -- Already in an org: just make sure admin_instructors rows exist for every admin.
    INSERT INTO admin_instructors (admin_id, instructor_id, org_id)
    SELECT p.id, NEW.id, NEW.org_id
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'admin'
    WHERE p.org_id = NEW.org_id
    ON CONFLICT (admin_id, instructor_id) DO NOTHING;
    RETURN NEW;
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = NEW.id;
  IF v_user_email IS NULL THEN
    RETURN NEW;
  END IF;

  v_email_domain := lower(split_part(v_user_email, '@', 2));

  SELECT org_id INTO v_invite_org_id
  FROM instructor_invites
  WHERE lower(email) = lower(v_user_email)
    AND status = 'pending'
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF v_invite_org_id IS NOT NULL THEN
    NEW.org_id := v_invite_org_id;

    UPDATE instructor_invites
    SET status = 'accepted', accepted_at = now()
    WHERE org_id = v_invite_org_id AND lower(email) = lower(v_user_email);

    INSERT INTO admin_instructors (admin_id, instructor_id, org_id)
    SELECT p.id, NEW.id, v_invite_org_id
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'admin'
    WHERE p.org_id = v_invite_org_id
    ON CONFLICT (admin_id, instructor_id) DO NOTHING;

    RETURN NEW;
  END IF;

  SELECT od.org_id INTO v_matched_org_id
  FROM organization_domains od
  WHERE lower(od.domain) = v_email_domain
  LIMIT 1;

  IF v_matched_org_id IS NOT NULL THEN
    NEW.org_id := v_matched_org_id;

    INSERT INTO admin_instructors (admin_id, instructor_id, org_id)
    SELECT p.id, NEW.id, v_matched_org_id
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'admin'
    WHERE p.org_id = v_matched_org_id
    ON CONFLICT (admin_id, instructor_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Fan out seat allocation auto-connect to all admins as well
CREATE OR REPLACE FUNCTION public.auto_connect_on_seat_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT s.org_id INTO v_org_id
  FROM seat_licenses sl
  JOIN subscriptions s ON s.id = sl.subscription_id
  WHERE sl.id = NEW.seat_license_id;

  IF v_org_id IS NOT NULL THEN
    UPDATE profiles
    SET org_id = v_org_id
    WHERE id = NEW.instructor_id AND org_id IS NULL;

    INSERT INTO admin_instructors (admin_id, instructor_id, org_id)
    SELECT p.id, NEW.instructor_id, v_org_id
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'admin'
    WHERE p.org_id = v_org_id
    ON CONFLICT (admin_id, instructor_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
