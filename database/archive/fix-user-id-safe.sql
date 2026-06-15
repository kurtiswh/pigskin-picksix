-- Safe fix for user ID mismatches that handles foreign key constraints
-- This approach temporarily disables constraints, fixes IDs, then re-enables them

-- Step 1: Show current state
SELECT 'BEFORE FIX - Auth users:' as info;
SELECT id, email FROM auth.users ORDER BY email;

SELECT 'BEFORE FIX - Public users:' as info;  
SELECT id, email, is_admin FROM public.users ORDER BY email;

-- Step 2: Temporarily disable foreign key constraints
ALTER TABLE public.picks DISABLE TRIGGER ALL;
ALTER TABLE public.leaguesafe_payments DISABLE TRIGGER ALL;

-- Step 3: Update related tables first to use the correct auth user IDs
-- Update picks table
UPDATE public.picks 
SET user_id = auth.users.id
FROM auth.users, public.users
WHERE picks.user_id = public.users.id 
AND public.users.email = auth.users.email 
AND public.users.id != auth.users.id;

-- Update leaguesafe_payments table  
UPDATE public.leaguesafe_payments 
SET user_id = auth.users.id
FROM auth.users, public.users
WHERE leaguesafe_payments.user_id = public.users.id 
AND public.users.email = auth.users.email 
AND public.users.id != auth.users.id;

-- Step 4: Now safely update the users table
UPDATE public.users 
SET id = auth.users.id
FROM auth.users
WHERE public.users.email = auth.users.email 
AND public.users.id != auth.users.id;

-- Step 5: Insert any missing users
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

-- Step 6: Re-enable foreign key constraints
ALTER TABLE public.picks ENABLE TRIGGER ALL;
ALTER TABLE public.leaguesafe_payments ENABLE TRIGGER ALL;

-- Step 7: Re-enable the user creation trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Step 8: Verify the fix
SELECT 'AFTER FIX - Verification:' as info;
SELECT 
    (SELECT count(*) FROM auth.users) as auth_user_count,
    (SELECT count(*) FROM public.users) as public_user_count,
    (SELECT count(*) FROM auth.users au JOIN public.users pu ON au.id = pu.id AND au.email = pu.email) as matched_users;

-- Step 9: Show final state
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