-- Create SECURITY DEFINER function to check group membership (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_group_member(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.study_group_members
    WHERE user_id = _user_id
      AND group_id = _group_id
  );
$$;

-- Create SECURITY DEFINER function to check if user is group owner or admin
CREATE OR REPLACE FUNCTION public.can_manage_group(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.study_group_members
    WHERE user_id = _user_id
      AND group_id = _group_id
      AND role IN ('owner', 'admin')
  );
$$;

-- Drop existing policies that cause infinite recursion
DROP POLICY IF EXISTS "Users can view members of their groups" ON public.study_group_members;
DROP POLICY IF EXISTS "Group owners and admins can add members" ON public.study_group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON public.study_group_members;

-- Recreate policies using SECURITY DEFINER functions (no recursion)
CREATE POLICY "Users can view members of their groups"
ON public.study_group_members
FOR SELECT
USING (public.is_group_member(auth.uid(), group_id));

CREATE POLICY "Group owners and admins can add members"
ON public.study_group_members
FOR INSERT
WITH CHECK (
  public.can_manage_group(auth.uid(), group_id) 
  OR auth.uid() = user_id
);

CREATE POLICY "Users can leave groups or admins can remove"
ON public.study_group_members
FOR DELETE
USING (
  auth.uid() = user_id 
  OR public.can_manage_group(auth.uid(), group_id)
);