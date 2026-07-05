DROP POLICY IF EXISTS "Admins can update their organization" ON public.organizations;
CREATE POLICY "Admins can update their organization"
  ON public.organizations FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND id = public.get_user_org_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND id = public.get_user_org_id(auth.uid())
  );

GRANT UPDATE (name) ON public.organizations TO authenticated;

CREATE OR REPLACE FUNCTION public.get_invited_org_names(_email text)
RETURNS TABLE(org_id uuid, org_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name
  FROM public.instructor_invites i
  JOIN public.organizations o ON o.id = i.org_id
  WHERE lower(i.email) = lower(_email)
    AND i.status = 'pending';
$$;

GRANT EXECUTE ON FUNCTION public.get_invited_org_names(text) TO authenticated;
