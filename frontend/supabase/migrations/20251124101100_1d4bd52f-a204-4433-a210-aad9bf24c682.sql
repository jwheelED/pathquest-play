-- Create study groups table
CREATE TABLE IF NOT EXISTS public.study_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  org_id UUID REFERENCES public.organizations(id),
  invite_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create study group members table
CREATE TABLE IF NOT EXISTS public.study_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  org_id UUID REFERENCES public.organizations(id),
  UNIQUE(group_id, user_id)
);

-- Create study group questions table (for shared questions)
CREATE TABLE IF NOT EXISTS public.study_group_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.personalized_questions(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL,
  shared_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  org_id UUID REFERENCES public.organizations(id),
  UNIQUE(group_id, question_id)
);

-- Enable RLS
ALTER TABLE public.study_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_group_questions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for study_groups
CREATE POLICY "Users can view groups they are members of"
  ON public.study_groups
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.study_group_members
      WHERE study_group_members.group_id = study_groups.id
      AND study_group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create study groups"
  ON public.study_groups
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group owners and admins can update groups"
  ON public.study_groups
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.study_group_members
      WHERE study_group_members.group_id = study_groups.id
      AND study_group_members.user_id = auth.uid()
      AND study_group_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Group owners can delete groups"
  ON public.study_groups
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.study_group_members
      WHERE study_group_members.group_id = study_groups.id
      AND study_group_members.user_id = auth.uid()
      AND study_group_members.role = 'owner'
    )
  );

-- RLS Policies for study_group_members
CREATE POLICY "Users can view members of their groups"
  ON public.study_group_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.study_group_members sgm
      WHERE sgm.group_id = study_group_members.group_id
      AND sgm.user_id = auth.uid()
    )
  );

CREATE POLICY "Group owners and admins can add members"
  ON public.study_group_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.study_group_members
      WHERE study_group_members.group_id = study_group_members.group_id
      AND study_group_members.user_id = auth.uid()
      AND study_group_members.role IN ('owner', 'admin')
    ) OR auth.uid() = user_id
  );

CREATE POLICY "Users can leave groups"
  ON public.study_group_members
  FOR DELETE
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.study_group_members sgm
    WHERE sgm.group_id = study_group_members.group_id
    AND sgm.user_id = auth.uid()
    AND sgm.role IN ('owner', 'admin')
  ));

-- RLS Policies for study_group_questions
CREATE POLICY "Group members can view shared questions"
  ON public.study_group_questions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.study_group_members
      WHERE study_group_members.group_id = study_group_questions.group_id
      AND study_group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Group members can share questions"
  ON public.study_group_questions
  FOR INSERT
  WITH CHECK (
    auth.uid() = shared_by
    AND EXISTS (
      SELECT 1 FROM public.study_group_members
      WHERE study_group_members.group_id = study_group_questions.group_id
      AND study_group_members.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.personalized_questions
      WHERE personalized_questions.id = study_group_questions.question_id
      AND personalized_questions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can unshare their own questions"
  ON public.study_group_questions
  FOR DELETE
  USING (auth.uid() = shared_by);

-- Function to generate unique invite codes
CREATE OR REPLACE FUNCTION generate_group_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN 'GRP-' || result;
END;
$$;

-- Trigger to set invite code on group creation
CREATE OR REPLACE FUNCTION set_group_invite_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invite_code IS NULL OR NEW.invite_code = '' THEN
    LOOP
      NEW.invite_code := generate_group_invite_code();
      IF NOT EXISTS (
        SELECT 1 FROM study_groups 
        WHERE invite_code = NEW.invite_code 
        AND id != NEW.id
      ) THEN
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_group_invite_code_trigger
BEFORE INSERT ON public.study_groups
FOR EACH ROW
EXECUTE FUNCTION set_group_invite_code();

-- Trigger to add creator as owner when group is created
CREATE OR REPLACE FUNCTION add_group_creator_as_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.study_group_members (group_id, user_id, role, org_id)
  VALUES (NEW.id, NEW.created_by, 'owner', NEW.org_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER add_group_creator_as_owner_trigger
AFTER INSERT ON public.study_groups
FOR EACH ROW
EXECUTE FUNCTION add_group_creator_as_owner();

-- Function to validate and join group by invite code
CREATE OR REPLACE FUNCTION join_group_by_code(_invite_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id UUID;
  v_org_id UUID;
BEGIN
  -- Find group by invite code
  SELECT id, org_id INTO v_group_id, v_org_id
  FROM public.study_groups
  WHERE invite_code = _invite_code;
  
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;
  
  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM public.study_group_members
    WHERE group_id = v_group_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are already a member of this group';
  END IF;
  
  -- Add user as member
  INSERT INTO public.study_group_members (group_id, user_id, role, org_id)
  VALUES (v_group_id, auth.uid(), 'member', v_org_id);
  
  RETURN v_group_id;
END;
$$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_study_group_members_user_id ON public.study_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_study_group_members_group_id ON public.study_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_study_group_questions_group_id ON public.study_group_questions(group_id);
CREATE INDEX IF NOT EXISTS idx_study_group_questions_question_id ON public.study_group_questions(question_id);
CREATE INDEX IF NOT EXISTS idx_study_groups_invite_code ON public.study_groups(invite_code);