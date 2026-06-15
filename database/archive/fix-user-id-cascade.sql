-- Safe fix that works with foreign key constraints by using CASCADE updates
-- This approach updates all related tables in the correct order

-- Step 1: Show current state
SELECT 'BEFORE FIX - Checking for ID mismatches:' as info;
SELECT 
    au.id as auth_id, 
    pu.id as public_id, 
    au.email,
    CASE WHEN au.id = pu.id THEN 'MATCHED' ELSE 'MISMATCH' END as status
FROM auth.users au
LEFT JOIN public.users pu ON au.email = pu.email
ORDER BY au.email;

-- Step 2: For mismatched users, we'll delete the old public.users record 
-- and create a new one with the correct auth ID
-- First, let's create a temporary table to store the user data we want to preserve
CREATE TEMP TABLE temp_user_data AS
SELECT 
    au.id as correct_id,
    pu.id as old_id,
    pu.email,
    pu.display_name,
    pu.is_admin,
    pu.leaguesafe_email,
    pu.created_at,
    pu.payment_status
FROM auth.users au
JOIN public.users pu ON au.email = pu.email
WHERE au.id != pu.id;

-- Step 3: Update all foreign key references to point to the correct auth user IDs
-- Update picks table
UPDATE public.picks 
SET user_id = temp_user_data.correct_id
FROM temp_user_data
WHERE picks.user_id = temp_user_data.old_id;

-- Update leaguesafe_payments table
UPDATE public.leaguesafe_payments 
SET user_id = temp_user_data.correct_id
FROM temp_user_data
WHERE leaguesafe_payments.user_id = temp_user_data.old_id;

-- Step 4: Delete the old user records with wrong IDs
DELETE FROM public.users 
WHERE id IN (SELECT old_id FROM temp_user_data);

-- Step 5: Insert the users back with correct IDs
INSERT INTO public.users (id, email, display_name, is_admin, leaguesafe_email, created_at, payment_status)
SELECT 
    correct_id,
    email,
    display_name,
    is_admin,
    leaguesafe_email,
    created_at,
    payment_status
FROM temp_user_data
ON CONFLICT (id) DO NOTHING;

-- Step 6: Insert any users that exist in auth but not in public at all
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
SELECT 'FINAL STATE - All users should be MATCHED:' as info;
SELECT 
    au.id, 
    au.email, 
    pu.display_name, 
    pu.is_admin,
    CASE WHEN au.id = pu.id THEN 'MATCHED' ELSE 'MISMATCH' END as status
FROM auth.users au
LEFT JOIN public.users pu ON au.email = pu.email
ORDER BY au.email;