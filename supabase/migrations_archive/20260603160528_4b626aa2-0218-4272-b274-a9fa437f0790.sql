CREATE POLICY "Admins can view org member roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = user_roles.user_id
      AND p.org_id = public.get_user_org_id(auth.uid())
  )
);