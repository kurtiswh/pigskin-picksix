-- Fix: Allow anon role to read users table
-- The issue is the policies expect authenticated users, but we're using anon key

-- Drop the restrictive policies that only work for authenticated users
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "authenticated_users_select_all" ON public.users;

-- Create a simple policy that works for both anon and authenticated roles
-- This allows the app to function with the anon key
CREATE POLICY "allow_select_users" 
ON public.users FOR SELECT 
USING (true);

-- Verify the change
SELECT tablename, policyname, cmd, roles, qual 
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'users' AND cmd = 'SELECT';