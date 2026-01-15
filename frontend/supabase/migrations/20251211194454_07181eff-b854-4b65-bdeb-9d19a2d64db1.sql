-- Drop the overly permissive policy that allows any authenticated user to read private keys
DROP POLICY IF EXISTS "Service role manages tool keys" ON public.lti_tool_keys;

-- Create a restrictive policy that denies all client access
-- Service role bypasses RLS, so edge functions using service role can still access
CREATE POLICY "Deny all client access to tool keys"
ON public.lti_tool_keys
FOR ALL
USING (false)
WITH CHECK (false);