-- Check auth table
SELECT 'AUTH TABLE' as source, id::text, email, email_confirmed_at::text, created_at::text 
FROM auth.users 
WHERE email = 'kurtiswh+testadmin@gmail.com';

-- Check public table  
SELECT 'PUBLIC TABLE' as source, id::text, email, created_at::text, updated_at::text
FROM public.users 
WHERE email = 'kurtiswh+testadmin@gmail.com';