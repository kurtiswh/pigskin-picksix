-- Create User Record Manually
-- Copy and paste this into your Supabase SQL Editor

-- First, let's see what auth functions return (they might be null in SQL editor)
SELECT 
    auth.uid() as current_auth_uid,
    auth.email() as current_auth_email,
    'Auth functions may return null in SQL editor' as note;

-- Check what columns exist in the users table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Since auth.uid() is null in SQL editor, we need to find your user another way
-- Let's check if there are any existing users we can identify as yours
SELECT 
    id,
    email,
    display_name,
    is_admin,
    created_at,
    registration_source
FROM public.users 
ORDER BY created_at DESC
LIMIT 10;

-- Check auth.users table to find your user ID
SELECT 
    id,
    email,
    created_at,
    last_sign_in_at
FROM auth.users
ORDER BY last_sign_in_at DESC NULLS LAST
LIMIT 5;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔍 NEXT STEPS:';
    RAISE NOTICE '';
    RAISE NOTICE '1. Look at the auth.users table results above';
    RAISE NOTICE '2. Find your user ID (the one with your email)';
    RAISE NOTICE '3. Copy your user ID';
    RAISE NOTICE '4. Run the manual insert script below with YOUR actual ID and email';
    RAISE NOTICE '';
    RAISE NOTICE '💡 The auth functions return null in SQL editor context';
    RAISE NOTICE '   but work fine in the application context';
END;
$$;

-- MANUAL STEP: Replace the values below with YOUR actual information
-- Get your user ID from the auth.users query results above
/*
INSERT INTO public.users (
    id,
    email,
    display_name,
    is_admin,
    created_at
) 
VALUES (
    'YOUR_USER_ID_HERE',     -- Replace with your actual UUID from auth.users table
    'your-email@domain.com', -- Replace with your actual email
    'Admin User',            -- You can change this name
    true,                    -- Admin privileges
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    is_admin = true,
    email = EXCLUDED.email;
*/

-- After inserting, verify with this query:
/*
SELECT 
    id,
    email,
    display_name,
    is_admin,
    'Ready for leaderboard controls!' as status
FROM public.users 
WHERE email = 'your-email@domain.com';  -- Replace with your email
*/