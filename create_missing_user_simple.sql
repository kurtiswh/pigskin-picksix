-- Create Missing User Record (Simplified Version)
-- Copy and paste this into your Supabase SQL Editor

-- First, let's see what auth information we have
SELECT 
    auth.uid() as current_auth_uid,
    auth.email() as current_auth_email;

-- Check if the user exists in the public.users table
SELECT 
    id,
    email,
    display_name,
    is_admin,
    created_at
FROM public.users 
WHERE id = auth.uid() OR email = auth.email();

-- Let's first check what columns actually exist in the users table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'users' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Create the missing user record (only with columns that exist)
INSERT INTO public.users (
    id,
    email,
    display_name,
    is_admin,
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
    created_at,
    (id = auth.uid()) as auth_uid_matches
FROM public.users 
WHERE id = auth.uid();

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ User Record Creation Complete!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 WHAT HAPPENED:';
    RAISE NOTICE '• Checked your current auth status';
    RAISE NOTICE '• Created your user record in public.users table';
    RAISE NOTICE '• Granted admin privileges (is_admin = true)';
    RAISE NOTICE '';
    RAISE NOTICE '💡 The leaderboard visibility controls should now work!';
END;
$$;