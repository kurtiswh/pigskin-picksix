-- Create Missing User Record (Minimal Version)
-- Copy and paste this into your Supabase SQL Editor

-- First, let's see what auth information we have
SELECT 
    auth.uid() as current_auth_uid,
    auth.email() as current_auth_email;

-- Check what columns exist in the users table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if the user exists in the public.users table
SELECT 
    id,
    email,
    display_name,
    is_admin,
    created_at
FROM public.users 
WHERE id = auth.uid();

-- Create the missing user record with minimal required fields
-- Replace 'Your Name Here' with your actual name
INSERT INTO public.users (
    id,
    email,
    display_name,
    is_admin,
    created_at
) 
VALUES (
    auth.uid(),
    auth.email(),
    'Admin User',  -- Simple fallback name
    true,          -- Grant admin privileges
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    is_admin = true,  -- Ensure admin privileges even if user exists
    email = EXCLUDED.email;

-- Verify the user was created/updated successfully
SELECT 
    id,
    email,
    display_name,
    is_admin,
    created_at,
    (id = auth.uid()) as auth_uid_matches,
    CASE WHEN is_admin = true THEN '✅ Has Admin Access' ELSE '❌ Missing Admin Access' END as admin_status
FROM public.users 
WHERE id = auth.uid();

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ User Record Created/Updated Successfully!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 WHAT HAPPENED:';
    RAISE NOTICE '• Used your current auth.uid() and auth.email()';
    RAISE NOTICE '• Created/updated your user record in public.users table';
    RAISE NOTICE '• Granted admin privileges (is_admin = true)';
    RAISE NOTICE '';
    RAISE NOTICE '💡 Try the leaderboard visibility controls now!';
END;
$$;