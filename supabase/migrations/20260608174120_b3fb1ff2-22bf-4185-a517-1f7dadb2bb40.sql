
CREATE OR REPLACE FUNCTION public.get_admin_connected_instructors(_admin_id uuid)
 RETURNS TABLE(instructor_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
BEGIN
  IF NOT has_role(_admin_id, 'admin'::app_role) THEN
    RETURN;
  END IF;

  SELECT org_id INTO v_org_id FROM profiles WHERE id = _admin_id;
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT p.id
  FROM profiles p
  JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'instructor'::app_role
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.org_id = v_org_id
    AND (
      -- Direct admin<->instructor link (admin code, seat allocation, manual)
      EXISTS (
        SELECT 1 FROM admin_instructors ai
        WHERE ai.org_id = v_org_id
          AND ai.instructor_id = p.id
      )
      OR EXISTS (
        SELECT 1 FROM instructor_invites ii
        WHERE ii.org_id = v_org_id
          AND lower(ii.email) = lower(u.email)
          AND ii.status = 'accepted'
      )
      OR EXISTS (
        SELECT 1 FROM organization_domains od
        WHERE od.org_id = v_org_id
          AND lower(od.domain) = lower(split_part(u.email, '@', 2))
      )
      OR EXISTS (
        SELECT 1 FROM seat_allocations sa
        JOIN seat_licenses sl ON sl.id = sa.seat_license_id
        JOIN subscriptions s ON s.id = sl.subscription_id
        WHERE sa.instructor_id = p.id
          AND s.org_id = v_org_id
      )
    );
END;
$function$;
