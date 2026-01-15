-- Create trigger to automatically set admin code when admin profile is created
CREATE OR REPLACE TRIGGER set_admin_code_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_admin_code();