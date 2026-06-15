-- Temporarily disable RLS on users table to test if that's the issue
-- This is just for debugging - we'll re-enable it after testing

-- Disable RLS temporarily
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Check if RLS is disabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'users' AND schemaname = 'public';