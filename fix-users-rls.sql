-- Fix RLS policies for users table to allow access
-- The 401 Unauthorized error indicates RLS is blocking access

-- First check current policies
SELECT tablename, policyname, cmd, roles, qual 
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'users';

-- Drop any problematic existing policies
DROP POLICY IF EXISTS "Users can view all profiles" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.users;

-- Create a simple policy that allows all authenticated users to read all user profiles
-- This is needed for admin functionality and leaderboards
CREATE POLICY "Allow authenticated users to read all profiles" 
ON public.users FOR SELECT 
USING (auth.role() = 'authenticated');

-- Create a policy for users to update their own profile
CREATE POLICY "Users can update own profile" 
ON public.users FOR UPDATE 
USING (auth.uid() = id);

-- Create a policy for admins to update any profile  
CREATE POLICY "Admins can update any profile" 
ON public.users FOR UPDATE 
USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
);

-- Verify the fix
SELECT tablename, policyname, cmd, roles, qual 
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'users';