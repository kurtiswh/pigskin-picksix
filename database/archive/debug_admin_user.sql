-- Debug admin user jstovall5@yahoo.com
-- Run this in Supabase SQL Editor

-- Check the user's data directly
SELECT 
    id,
    email, 
    display_name,
    is_admin,
    created_at,
    updated_at
FROM public.users 
WHERE email = 'jstovall5@yahoo.com';

-- Check if there are any permission issues
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual 
FROM pg_policies 
WHERE tablename = 'users' 
AND policyname ILIKE '%admin%';

-- Test what a simple query returns for this user
SELECT COUNT(*) as total_users FROM public.users;
SELECT COUNT(*) as admin_users FROM public.users WHERE is_admin = true;

-- Check if there are any other users with similar emails
SELECT 
    id,
    email,
    display_name,
    is_admin
FROM public.users 
WHERE email ILIKE '%jstovall%' 
   OR email ILIKE '%yahoo%'
ORDER BY email;