-- Check if the admin user exists in both auth.users and public.users tables
-- Run this in Supabase SQL Editor

-- Check auth.users table
SELECT id, email, email_confirmed_at, created_at 
FROM auth.users 
WHERE email = 'kurtiswh+testadmin@gmail.com';

-- Check public.users table  
SELECT id, email, display_name, is_admin 
FROM public.users 
WHERE email = 'kurtiswh+testadmin@gmail.com';

-- Check if IDs match between tables
SELECT 
  au.id as auth_id,
  au.email as auth_email,
  au.email_confirmed_at,
  pu.id as public_id,
  pu.email as public_email,
  pu.is_admin
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id
WHERE au.email = 'kurtiswh+testadmin@gmail.com';