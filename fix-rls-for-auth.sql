-- Fix RLS policies to allow auth functionality
-- Run this in your Supabase SQL editor

-- Allow anonymous users to read users table for auth checks
CREATE POLICY "Allow anonymous read for auth checks" ON public.users
    FOR SELECT USING (true);

-- Allow authenticated users to read their own records
CREATE POLICY "Users can read own record" ON public.users
    FOR SELECT USING (auth.uid() = id);

-- Allow the auth trigger to insert new users
CREATE POLICY "Allow auth trigger to insert users" ON public.users
    FOR INSERT WITH CHECK (true);

-- Allow authenticated users to update their own records  
CREATE POLICY "Users can update own record" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- Check current policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'users';

-- Test if policies work
SELECT 'RLS policies updated successfully' as message;