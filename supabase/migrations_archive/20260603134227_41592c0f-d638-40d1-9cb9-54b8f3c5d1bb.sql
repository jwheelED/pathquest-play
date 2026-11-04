
CREATE OR REPLACE FUNCTION public.admin_sync_org_members()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_org_id uuid;
  v_instructors_linked int := 0;
  v_students_linked int := 0;
  v_admin_links_created int := 0;
  v_rows int := 0;
  r record;
BEGIN
  IF NOT has_role(v_admin_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can run sync';
  END IF;

  SELECT org_id INTO v_org_id FROM profiles WHERE id = v_admin_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Admin has no organization';
  END IF;

  -- 1) Accept pending invites for users who already signed up
  FOR r IN
    SELECT ii.id AS invite_id, ii.email, ii.org_id, u.id AS user_id
    FROM instructor_invites ii
    JOIN auth.users u ON lower(u.email) = lower(ii.email)
    WHERE ii.org_id = v_org_id
      AND ii.status = 'pending'
  LOOP
    UPDATE profiles
      SET org_id = r.org_id
      WHERE id = r.user_id AND (org_id IS NULL OR org_id <> r.org_id);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_instructors_linked := v_instructors_linked + v_rows;
    UPDATE instructor_invites SET status = 'accepted', accepted_at = now() WHERE id = r.invite_id;
  END LOOP;

  -- 2) Domain-based connection for instructors with matching email domain but no org
  FOR r IN
    SELECT p.id AS user_id, od.org_id
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'instructor'::app_role
    JOIN auth.users u ON u.id = p.id
    JOIN organization_domains od ON lower(od.domain) = lower(split_part(u.email, '@', 2))
    WHERE p.org_id IS NULL
      AND od.org_id = v_org_id
  LOOP
    UPDATE profiles SET org_id = r.org_id WHERE id = r.user_id;
    v_instructors_linked := v_instructors_linked + 1;
  END LOOP;

  -- 3) Ensure admin_instructors rows exist for every instructor in this org
  INSERT INTO admin_instructors (admin_id, instructor_id, org_id)
  SELECT v_admin_id, p.id, v_org_id
  FROM profiles p
  JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'instructor'::app_role
  WHERE p.org_id = v_org_id
  ON CONFLICT (admin_id, instructor_id) DO NOTHING;
  GET DIAGNOSTICS v_admin_links_created = ROW_COUNT;

  -- 4) Backfill students' org_id from their instructor relationships
  WITH updated AS (
    UPDATE profiles sp
    SET org_id = v_org_id
    FROM instructor_students ist
    JOIN profiles ip ON ip.id = ist.instructor_id
    WHERE sp.id = ist.student_id
      AND ip.org_id = v_org_id
      AND (sp.org_id IS NULL OR sp.org_id <> v_org_id)
    RETURNING sp.id
  )
  SELECT count(*) INTO v_students_linked FROM updated;

  -- 5) Backfill org_id on instructor_students join rows
  UPDATE instructor_students ist
  SET org_id = v_org_id
  FROM profiles ip
  WHERE ip.id = ist.instructor_id
    AND ip.org_id = v_org_id
    AND ist.org_id IS NULL;

  RETURN jsonb_build_object(
    'instructors_linked', v_instructors_linked,
    'students_linked', v_students_linked,
    'admin_links_created', v_admin_links_created,
    'org_id', v_org_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_sync_org_members() TO authenticated;
