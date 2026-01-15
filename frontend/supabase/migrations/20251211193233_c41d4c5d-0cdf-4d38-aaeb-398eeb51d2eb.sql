-- Create LTI platforms table for registered LMS systems
CREATE TABLE public.lti_platforms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.organizations(id),
  platform_name TEXT NOT NULL,
  platform_type TEXT NOT NULL, -- canvas, blackboard, moodle, brightspace
  issuer TEXT NOT NULL,
  client_id TEXT NOT NULL,
  deployment_id TEXT,
  auth_url TEXT NOT NULL,
  token_url TEXT NOT NULL,
  jwks_url TEXT NOT NULL,
  ags_scopes TEXT[] DEFAULT ARRAY['https://purl.imsglobal.org/spec/lti-ags/scope/lineitem', 'https://purl.imsglobal.org/spec/lti-ags/scope/score'],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, issuer, client_id)
);

-- Create LTI tool keys for RSA signing
CREATE TABLE public.lti_tool_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kid TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'RS256',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Create LTI contexts to map LMS courses to Edvana
CREATE TABLE public.lti_contexts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform_id UUID NOT NULL REFERENCES public.lti_platforms(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL,
  context_id TEXT NOT NULL, -- LMS course ID
  context_title TEXT,
  resource_link_id TEXT,
  lineitem_url TEXT, -- AGS lineitem endpoint for grades
  lineitems_url TEXT, -- AGS lineitems collection endpoint
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(platform_id, context_id)
);

-- Create LTI user mappings
CREATE TABLE public.lti_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform_id UUID NOT NULL REFERENCES public.lti_platforms(id) ON DELETE CASCADE,
  lti_user_id TEXT NOT NULL, -- User ID from LMS
  edvana_user_id UUID, -- Linked Edvana user (can be null for new users)
  email TEXT,
  name TEXT,
  roles TEXT[], -- LTI roles
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(platform_id, lti_user_id)
);

-- Create grade sync log for audit trail
CREATE TABLE public.grade_sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  context_id UUID REFERENCES public.lti_contexts(id),
  student_id UUID NOT NULL,
  lti_user_id TEXT,
  assignment_type TEXT NOT NULL, -- live_session, assignment, lecture
  assignment_id UUID NOT NULL,
  score_given NUMERIC NOT NULL,
  score_maximum NUMERIC NOT NULL DEFAULT 100,
  activity_progress TEXT DEFAULT 'Completed',
  grading_progress TEXT DEFAULT 'FullyGraded',
  lms_response JSONB,
  sync_status TEXT NOT NULL DEFAULT 'pending', -- pending, success, failed
  error_message TEXT,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  retry_count INTEGER DEFAULT 0
);

-- Create OAuth2 token cache for LMS access tokens
CREATE TABLE public.lti_token_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform_id UUID NOT NULL REFERENCES public.lti_platforms(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  scope TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lti_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lti_tool_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lti_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lti_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lti_token_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lti_platforms
CREATE POLICY "Admins can manage org LTI platforms"
ON public.lti_platforms FOR ALL
USING (
  has_role(auth.uid(), 'admin') AND 
  org_id = get_user_org_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'admin') AND 
  org_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Instructors can view org LTI platforms"
ON public.lti_platforms FOR SELECT
USING (
  has_role(auth.uid(), 'instructor') AND 
  org_id = get_user_org_id(auth.uid())
);

-- RLS for lti_tool_keys (service role only for private keys)
CREATE POLICY "Service role manages tool keys"
ON public.lti_tool_keys FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- RLS for lti_contexts
CREATE POLICY "Instructors manage their LTI contexts"
ON public.lti_contexts FOR ALL
USING (auth.uid() = instructor_id)
WITH CHECK (auth.uid() = instructor_id);

CREATE POLICY "Admins view org LTI contexts"
ON public.lti_contexts FOR SELECT
USING (
  has_role(auth.uid(), 'admin') AND
  EXISTS (
    SELECT 1 FROM lti_platforms lp
    WHERE lp.id = lti_contexts.platform_id
    AND lp.org_id = get_user_org_id(auth.uid())
  )
);

-- RLS for lti_users
CREATE POLICY "Users can view their own LTI mapping"
ON public.lti_users FOR SELECT
USING (edvana_user_id = auth.uid());

CREATE POLICY "Instructors view LTI users in their contexts"
ON public.lti_users FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM lti_contexts lc
    WHERE lc.platform_id = lti_users.platform_id
    AND lc.instructor_id = auth.uid()
  )
);

-- RLS for grade_sync_log
CREATE POLICY "Instructors view grade sync logs"
ON public.grade_sync_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM lti_contexts lc
    WHERE lc.id = grade_sync_log.context_id
    AND lc.instructor_id = auth.uid()
  )
);

CREATE POLICY "System can insert grade sync logs"
ON public.grade_sync_log FOR INSERT
WITH CHECK (true);

-- RLS for lti_token_cache (service role only)
CREATE POLICY "Service role manages token cache"
ON public.lti_token_cache FOR ALL
USING (true)
WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_lti_platforms_org ON public.lti_platforms(org_id);
CREATE INDEX idx_lti_contexts_instructor ON public.lti_contexts(instructor_id);
CREATE INDEX idx_lti_contexts_platform ON public.lti_contexts(platform_id);
CREATE INDEX idx_lti_users_edvana ON public.lti_users(edvana_user_id);
CREATE INDEX idx_grade_sync_log_student ON public.grade_sync_log(student_id);
CREATE INDEX idx_grade_sync_log_status ON public.grade_sync_log(sync_status);
CREATE INDEX idx_lti_token_cache_platform ON public.lti_token_cache(platform_id);

-- Trigger for updated_at
CREATE TRIGGER update_lti_platforms_updated_at
  BEFORE UPDATE ON public.lti_platforms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lti_contexts_updated_at
  BEFORE UPDATE ON public.lti_contexts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lti_users_updated_at
  BEFORE UPDATE ON public.lti_users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();