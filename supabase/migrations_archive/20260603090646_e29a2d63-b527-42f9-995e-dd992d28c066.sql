
CREATE TABLE public.admin_dashboard_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_dashboard_presets_admin ON public.admin_dashboard_presets(admin_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_dashboard_presets TO authenticated;
GRANT ALL ON public.admin_dashboard_presets TO service_role;

ALTER TABLE public.admin_dashboard_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage their own presets - select"
ON public.admin_dashboard_presets FOR SELECT
TO authenticated
USING (admin_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage their own presets - insert"
ON public.admin_dashboard_presets FOR INSERT
TO authenticated
WITH CHECK (admin_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage their own presets - update"
ON public.admin_dashboard_presets FOR UPDATE
TO authenticated
USING (admin_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage their own presets - delete"
ON public.admin_dashboard_presets FOR DELETE
TO authenticated
USING (admin_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_admin_dashboard_presets_updated_at
BEFORE UPDATE ON public.admin_dashboard_presets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
