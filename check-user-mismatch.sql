-- Check for mismatched users between auth.users and public.users
-- This will help us understand what's causing the conflict

-- Show auth.users
SELECT 'AUTH USERS:' as section;
SELECT id, email, created_at 
FROM auth.users 
ORDER BY created_at;

-- Show public.users  
SELECT 'PUBLIC USERS:' as section;
SELECT id, email, display_name, is_admin, created_at
FROM public.users 
ORDER BY created_at;

-- Show mismatches - users in auth but not in public
SELECT 'MISSING IN PUBLIC:' as section;
SELECT au.id, au.email, 'Missing in public.users' as status
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id
WHERE pu.id IS NULL;

-- Show mismatches - different IDs for same email
SELECT 'ID MISMATCHES:' as section;
SELECT 
    au.id as auth_id, 
    pu.id as public_id, 
    au.email as auth_email, 
    pu.email as public_email,
    'ID mismatch' as status
FROM auth.users au
JOIN public.users pu ON au.email = pu.email
WHERE au.id != pu.id;