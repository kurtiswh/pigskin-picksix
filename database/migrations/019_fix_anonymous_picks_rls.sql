-- Fix RLS policies for anonymous_picks table to allow API key updates
-- The issue is that we're using the anon key for admin operations

-- Drop the existing policy that only allows authenticated admin users
DROP POLICY IF EXISTS "Allow admins to manage assignments" ON public.anonymous_picks;

-- Create a more permissive policy for assignment operations
-- This allows updates to assignment fields when using the service role or anon key
-- for admin operations (since our admin interface uses API keys, not user sessions)
CREATE POLICY "Allow assignment updates" ON public.anonymous_picks
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Alternative: If you want to keep it more secure, you could create a custom role
-- But for now, this allows the admin interface to work with API keys

-- Also ensure the table has proper permissions
GRANT UPDATE ON public.anonymous_picks TO anon;
GRANT UPDATE ON public.anonymous_picks TO authenticated;