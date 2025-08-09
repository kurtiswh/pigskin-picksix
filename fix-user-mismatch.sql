-- Check and fix user ID mismatch
-- First, let's see what we have:

SELECT 'AUTH TABLE' as source, id, email, email_confirmed_at, created_at 
FROM auth.users 
WHERE email = 'kurtiswh+testadmin@gmail.com'

UNION ALL

SELECT 'PUBLIC TABLE' as source, id::text, email, created_at::timestamptz, updated_at 
FROM public.users 
WHERE email = 'kurtiswh+testadmin@gmail.com';

-- If IDs don't match, we need to update the public.users table:
-- (Run this only if the IDs are different)

-- UPDATE public.users 
-- SET id = '1aafe64f-43b1-4b82-a387-60d42c9261f4'
-- WHERE email = 'kurtiswh+testadmin@gmail.com';

-- Or if needed, delete the mismatched record and let the trigger recreate it:
-- DELETE FROM public.users WHERE email = 'kurtiswh+testadmin@gmail.com';