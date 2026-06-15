-- Check user ID mismatch between auth and public tables
SELECT 'AUTH TABLE' as source, id, email, email_confirmed_at, created_at 
FROM auth.users 
WHERE email = 'kurtiswh+testadmin@gmail.com'

UNION ALL

SELECT 'PUBLIC TABLE' as source, id::text, email, created_at::timestamptz, updated_at 
FROM public.users 
WHERE email = 'kurtiswh+testadmin@gmail.com';