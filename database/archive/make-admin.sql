-- Make kurtiswh+testadmin@gmail.com an admin user
-- Run this in your Supabase SQL Editor

UPDATE public.users 
SET is_admin = true 
WHERE email = 'kurtiswh+testadmin@gmail.com';

-- Verify the update
SELECT id, email, display_name, is_admin 
FROM public.users 
WHERE email = 'kurtiswh+testadmin@gmail.com';