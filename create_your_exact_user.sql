-- Create Your Exact User Record
-- Copy and paste this into your Supabase SQL Editor

-- Insert your user record with the exact UUID and email from the debug output
INSERT INTO public.users (
    id,
    email,
    display_name,
    is_admin,
    created_at
) 
VALUES (
    '3cc7c1aa-2f61-4289-8629-5bdee504441c',  -- Your exact auth UID
    'kurtiswh@gmail.com',                    -- Your exact auth email
    'Kurtis (Admin)',                        -- Display name
    true,                                    -- Admin privileges
    NOW()                                    -- Created timestamp
)
ON CONFLICT (id) DO UPDATE SET
    is_admin = true,                         -- Ensure admin privileges
    email = EXCLUDED.email,                  -- Update email if needed
    display_name = EXCLUDED.display_name;    -- Update display name

-- Verify the user was created successfully
SELECT 
    id,
    email,
    display_name,
    is_admin,
    created_at,
    CASE WHEN is_admin = true THEN '✅ Has Admin Access' ELSE '❌ Missing Admin Access' END as admin_status,
    CASE WHEN id = '3cc7c1aa-2f61-4289-8629-5bdee504441c' THEN '✅ UUID Matches' ELSE '❌ UUID Mismatch' END as uuid_status
FROM public.users 
WHERE id = '3cc7c1aa-2f61-4289-8629-5bdee504441c';

-- Also check if any other users exist with your email (duplicates)
SELECT 
    id,
    email,
    display_name,
    is_admin,
    created_at,
    'Potential duplicate' as note
FROM public.users 
WHERE email = 'kurtiswh@gmail.com'
ORDER BY created_at;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ User Record Created with Exact Auth Credentials!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 USED VALUES:';
    RAISE NOTICE '• UUID: 3cc7c1aa-2f61-4289-8629-5bdee504441c';
    RAISE NOTICE '• Email: kurtiswh@gmail.com';
    RAISE NOTICE '• Admin: true';
    RAISE NOTICE '';
    RAISE NOTICE '💡 The leaderboard controls should now work perfectly!';
    RAISE NOTICE '   Your auth.uid() matches your database record exactly.';
END;
$$;