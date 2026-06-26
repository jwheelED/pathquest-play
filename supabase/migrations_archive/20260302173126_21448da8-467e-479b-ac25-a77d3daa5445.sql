ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS kaltura_partner_id text,
ADD COLUMN IF NOT EXISTS kaltura_uiconf_id text;