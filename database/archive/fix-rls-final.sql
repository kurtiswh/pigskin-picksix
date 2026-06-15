-- Final fix for RLS policies to allow proper database access

-- Check current RLS status and policies
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users';

SELECT policyname, cmd, roles, qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users';

-- Drop all existing policies including the ones that already exist
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "authenticated_users_select_all" ON public.users;
DROP POLICY IF EXISTS "allow_select_users" ON public.users;
DROP POLICY IF EXISTS "Anyone can view users" ON public.users;
DROP POLICY IF EXISTS "authenticated_read_users" ON public.users;
DROP POLICY IF EXISTS "anon_read_users" ON public.users;

-- Create a simple policy that allows authenticated users to read all user profiles
-- This is needed for admin functionality and the app to work
CREATE POLICY "authenticated_read_users" ON public.users
    FOR SELECT 
    TO authenticated
    USING (true);

-- Also ensure anon role can read (for initial app functionality)  
CREATE POLICY "anon_read_users" ON public.users
    FOR SELECT 
    TO anon
    USING (true);

-- Verify the policies were created
SELECT policyname, cmd, roles, qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users';