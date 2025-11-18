-- Create admin_instructors junction table to track which admins can view which instructors
CREATE TABLE public.admin_instructors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(admin_id, instructor_id)
);

-- Enable RLS
ALTER TABLE public.admin_instructors ENABLE ROW LEVEL SECURITY;

-- Admins can view and manage their instructor connections
CREATE POLICY "Admins manage their instructor connections"
ON public.admin_instructors
FOR ALL
USING (
  auth.uid() = admin_id 
  AND has_role(auth.uid(), 'admin')
)
WITH CHECK (
  auth.uid() = admin_id 
  AND has_role(auth.uid(), 'admin')
);

-- Function to add instructor by code for an admin
CREATE OR REPLACE FUNCTION public.add_instructor_for_admin(_instructor_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instructor_id UUID;
  v_admin_id UUID;
  v_org_id UUID;
BEGIN
  -- Get current user (admin)
  v_admin_id := auth.uid();
  
  -- Verify user is an admin
  IF NOT has_role(v_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Only admins can add instructors';
  END IF;
  
  -- Get admin's org_id
  SELECT org_id INTO v_org_id
  FROM profiles
  WHERE id = v_admin_id;
  
  -- Find instructor by code and verify same org
  SELECT id INTO v_instructor_id
  FROM profiles
  WHERE instructor_code = _instructor_code
    AND org_id = v_org_id;
  
  IF v_instructor_id IS NULL THEN
    RAISE EXCEPTION 'Invalid instructor code or instructor not in your organization';
  END IF;
  
  -- Verify the user is actually an instructor
  IF NOT has_role(v_instructor_id, 'instructor') THEN
    RAISE EXCEPTION 'Code does not belong to an instructor';
  END IF;
  
  -- Insert connection (ON CONFLICT DO NOTHING to handle duplicates)
  INSERT INTO admin_instructors (admin_id, instructor_id, org_id)
  VALUES (v_admin_id, v_instructor_id, v_org_id)
  ON CONFLICT (admin_id, instructor_id) DO NOTHING;
  
  RETURN v_instructor_id;
END;
$$;

-- Update instructor_students RLS to respect admin_instructors relationship
DROP POLICY IF EXISTS "Org-scoped instructor student relationships" ON public.instructor_students;
CREATE POLICY "Org-scoped instructor student relationships"
ON public.instructor_students
FOR ALL
USING (
  org_id = get_user_org_id(auth.uid()) 
  AND (
    auth.uid() = instructor_id 
    OR auth.uid() = student_id
    OR (
      has_role(auth.uid(), 'admin') 
      AND EXISTS (
        SELECT 1 FROM admin_instructors 
        WHERE admin_id = auth.uid() 
        AND instructor_id = instructor_students.instructor_id
      )
    )
  )
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid()) 
  AND (auth.uid() = instructor_id OR auth.uid() = student_id)
);

-- Update student_assignments RLS to respect admin_instructors relationship
DROP POLICY IF EXISTS "Org-scoped assignment access" ON public.student_assignments;
CREATE POLICY "Org-scoped assignment access"
ON public.student_assignments
FOR ALL
USING (
  org_id = get_user_org_id(auth.uid()) 
  AND (
    auth.uid() = instructor_id 
    OR auth.uid() = student_id
    OR (
      has_role(auth.uid(), 'admin') 
      AND EXISTS (
        SELECT 1 FROM admin_instructors 
        WHERE admin_id = auth.uid() 
        AND instructor_id = student_assignments.instructor_id
      )
    )
  )
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid()) 
  AND (
    auth.uid() = instructor_id 
    OR (auth.uid() = student_id AND assignment_type != 'quiz')
  )
);