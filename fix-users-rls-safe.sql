-- Safe fix for users table RLS policies
-- First check what policies currently exist

SELECT 'Current policies:' as info;
SELECT tablename, policyname, cmd, roles, qual 
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'users';

-- The key issue is likely the SELECT policy - fix that specifically
DROP POLICY IF EXISTS "Users can view all profiles" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to read all profiles" ON public.users;

-- Create a simple, working SELECT policy
CREATE POLICY "authenticated_users_select_all" 
ON public.users FOR SELECT 
TO authenticated
USING (true);

-- Verify the fix
SELECT 'Updated policies:' as info;
SELECT tablename, policyname, cmd, roles, qual 
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'users';