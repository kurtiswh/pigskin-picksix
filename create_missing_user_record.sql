-- Create Missing User Record in Database
-- Copy and paste this into your Supabase SQL Editor

-- First, let's see what auth information we have
SELECT 
    auth.uid() as current_auth_uid,
    auth.email() as current_auth_email,
    auth.jwt() ->> 'email' as jwt_email,
    auth.jwt() ->> 'user_metadata' as user_metadata;

-- Check if the user exists in the public.users table
SELECT 
    id,
    email,
    display_name,
    is_admin,
    created_at
FROM public.users 
WHERE id = auth.uid() OR email = auth.email();

-- Create the missing user record
-- This will insert your user into the public.users table with admin privileges
INSERT INTO public.users (
    id,
    email,
    display_name,
    is_admin,
    is_verified,
    created_at,
    updated_at
) 
SELECT 
    auth.uid(),
    auth.email(),
    COALESCE(
        auth.jwt() ->> 'user_metadata' ->> 'display_name',
        auth.jwt() ->> 'user_metadata' ->> 'full_name',
        SPLIT_PART(auth.email(), '@', 1)  -- Use email username as fallback
    ) as display_name,
    true as is_admin,  -- Grant admin privileges
    true as is_verified,
    NOW() as created_at,
    NOW() as updated_at
WHERE NOT EXISTS (
    -- Only insert if user doesn't already exist
    SELECT 1 FROM public.users WHERE id = auth.uid()
);

-- Verify the user was created successfully
SELECT 
    id,
    email,
    display_name,
    is_admin,
    is_verified,
    created_at,
    (id = auth.uid()) as auth_uid_matches
FROM public.users 
WHERE id = auth.uid();

-- Also check if there are any triggers that should have created this user automatically
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'users' 
   OR action_statement LIKE '%users%'
ORDER BY trigger_name;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ User Record Creation Complete!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 WHAT HAPPENED:';
    RAISE NOTICE '• Checked your current auth status';
    RAISE NOTICE '• Created your user record in public.users table';
    RAISE NOTICE '• Granted admin privileges (is_admin = true)';
    RAISE NOTICE '• Set as verified user';
    RAISE NOTICE '';
    RAISE NOTICE '🧪 VERIFICATION:';
    RAISE NOTICE '• Check the query results above';
    RAISE NOTICE '• Ensure auth_uid_matches = true';
    RAISE NOTICE '• Ensure is_admin = true';
    RAISE NOTICE '';
    RAISE NOTICE '💡 The leaderboard visibility controls should now work!';
END;
$$;