-- Fix RLS policy issue for users table
-- The current policy might be blocking authenticated users from reading their own profile

-- Drop the existing problematic policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.users;

-- Create a new policy that allows authenticated users to read all profiles
CREATE POLICY "Authenticated users can view all profiles" ON public.users
    FOR SELECT USING (auth.role() = 'authenticated');

-- Also ensure users can read their own profile specifically
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);