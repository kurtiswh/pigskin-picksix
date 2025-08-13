-- Re-enable RLS and create a proper policy that works
-- Since week_settings and games work, let's copy their pattern

-- Re-enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop any existing problematic policies
DROP POLICY IF EXISTS "allow_select_users" ON public.users;

-- Create a policy similar to what works for games/week_settings
-- Check what policies games table has and copy that pattern
CREATE POLICY "Anyone can view users" ON public.users FOR SELECT USING (true);

-- Verify the policy
SELECT tablename, policyname, cmd, roles, qual 
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'users' AND cmd = 'SELECT';