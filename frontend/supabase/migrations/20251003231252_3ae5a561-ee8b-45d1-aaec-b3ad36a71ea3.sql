
-- Grant SELECT privilege to authenticated users on the users table
-- This is required for RLS policies to be evaluated
-- Without this grant, queries fail before RLS policies are even checked
GRANT SELECT ON public.users TO authenticated;

-- Also grant INSERT so authenticated users can create their own records
GRANT INSERT ON public.users TO authenticated;

-- Grant UPDATE so users can update their own records
GRANT UPDATE ON public.users TO authenticated;

-- Note: RLS policies will still restrict what data users can actually access
-- This grant just allows the queries to reach the RLS policy evaluation stage
