-- Fix user ID mismatches between auth.users and public.users
-- This is the root cause of RLS policy failures

-- Step 1: First, let's see what we're dealing with
SELECT 'BEFORE FIX - Auth users:' as info;
SELECT id, email FROM auth.users ORDER BY email;

SELECT 'BEFORE FIX - Public users:' as info;  
SELECT id, email, is_admin FROM public.users ORDER BY email;

-- Step 2: Fix the ID mismatches
-- For users that exist in both tables but with different IDs, update public.users to match auth.users
UPDATE public.users 
SET id = auth.users.id
FROM auth.users
WHERE public.users.email = auth.users.email 
AND public.users.id != auth.users.id;

-- Step 3: Insert any users that exist in auth but not in public
INSERT INTO public.users (id, email, display_name, is_admin)
SELECT 
    au.id,
    au.email,
    COALESCE(au.raw_user_meta_data->>'display_name', split_part(au.email, '@', 1)) as display_name,
    CASE 
        WHEN au.email LIKE '%+testadmin%' OR au.email LIKE '%+admin%' THEN true
        ELSE false
    END as is_admin
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.email = au.email)
ON CONFLICT (id) DO NOTHING;

-- Step 4: Re-enable the user creation trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Step 5: Verify the fix
SELECT 'AFTER FIX - Verification:' as info;
SELECT 
    (SELECT count(*) FROM auth.users) as auth_user_count,
    (SELECT count(*) FROM public.users) as public_user_count,
    (SELECT count(*) FROM auth.users au JOIN public.users pu ON au.id = pu.id AND au.email = pu.email) as matched_users;

-- Step 6: Show final state
SELECT 'FINAL STATE:' as info;
SELECT 
    au.id, 
    au.email, 
    pu.display_name, 
    pu.is_admin,
    CASE WHEN au.id = pu.id THEN 'MATCHED' ELSE 'MISMATCH' END as status
FROM auth.users au
LEFT JOIN public.users pu ON au.email = pu.email
ORDER BY au.email;