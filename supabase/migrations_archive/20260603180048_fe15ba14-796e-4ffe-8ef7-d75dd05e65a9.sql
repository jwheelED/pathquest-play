
CREATE OR REPLACE FUNCTION public.get_admin_connected_instructors(_admin_id uuid)
RETURNS TABLE(instructor_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  JOIN auth.users u ON u.id = p.id
  WHERE p.org_id = v_org_id
    AND (
      -- Connected via accepted invite for this org
      EXISTS (
        SELECT 1 FROM instructor_invites ii
        WHERE ii.org_id = v_org_id
          AND lower(ii.email) = lower(u.email)
          AND ii.status = 'accepted'
      )
      OR
      -- Connected via email domain match for this org
      EXISTS (
        SELECT 1 FROM organization_domains od
        WHERE od.org_id = v_org_id
          AND lower(od.domain) = lower(split_part(u.email, '@', 2))
      )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_connected_instructors(uuid) TO authenticated;
