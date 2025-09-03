-- Find and Update Your Existing User Record
-- Copy and paste this into your Supabase SQL Editor

-- First, find your existing user record
SELECT 
    id,
    email,
    display_name,
    is_admin,
    created_at,
    'This is your existing record' as note
FROM public.users 
WHERE email = 'kurtiswh@gmail.com';

-- Show what auth functions return for comparison
SELECT 
    '3cc7c1aa-2f61-4289-8629-5bdee504441c' as auth_uid_from_debug,
    'kurtiswh@gmail.com' as auth_email_from_debug;

-- Update your existing user record to match your auth UUID and grant admin privileges
UPDATE public.users 
SET 
    id = '3cc7c1aa-2f61-4289-8629-5bdee504441c',  -- Update to match auth.uid()
    is_admin = true,                              -- Grant admin privileges
    updated_at = NOW()                            -- Update timestamp if column exists
WHERE email = 'kurtiswh@gmail.com';

-- Alternative: If the UUID update fails due to constraints, just ensure admin privileges
UPDATE public.users 
SET 
    is_admin = true,
    updated_at = COALESCE(updated_at, NOW())
WHERE email = 'kurtiswh@gmail.com';

-- Verify the update
SELECT 
    id,
    email,
    display_name,
    is_admin,
    created_at,
    CASE WHEN is_admin = true THEN '✅ Has Admin Access' ELSE '❌ Missing Admin Access' END as admin_status,
    CASE WHEN id::text = '3cc7c1aa-2f61-4289-8629-5bdee504441c' THEN '✅ UUID Matches Auth' ELSE '❌ UUID Mismatch' END as uuid_status
FROM public.users 
WHERE email = 'kurtiswh@gmail.com';

-- If UUID can't be updated, let's create a second approach: update the auth functions to be more flexible
CREATE OR REPLACE FUNCTION public.toggle_picks_leaderboard_visibility_flexible(
    target_user_id UUID,
    target_season INTEGER,
    target_week INTEGER DEFAULT NULL,
    show_on_leaderboard BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    picks_updated INTEGER := 0;
    current_user_record RECORD;
BEGIN
    -- Try to find user by auth.uid() first, then by auth.email() as fallback
    SELECT u.id, u.email, u.is_admin, u.display_name 
    INTO current_user_record
    FROM public.users u 
    WHERE u.id = auth.uid() 
       OR u.email = auth.email()
    ORDER BY (u.id = auth.uid()) DESC  -- Prefer UUID match over email match
    LIMIT 1;
    
    -- Check if user exists and is admin
    IF current_user_record IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found by UUID or email',
            'auth_uid', auth.uid(),
            'auth_email', auth.email()
        );
    END IF;
    
    IF NOT COALESCE(current_user_record.is_admin, false) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Access denied: User does not have admin privileges',
            'user_email', current_user_record.email,
            'is_admin', current_user_record.is_admin
        );
    END IF;
    
    -- Update picks visibility
    IF target_week IS NULL THEN
        UPDATE public.picks 
        SET show_on_leaderboard = toggle_picks_leaderboard_visibility_flexible.show_on_leaderboard
        WHERE user_id = target_user_id 
        AND season = target_season;
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
    ELSE
        UPDATE public.picks 
        SET show_on_leaderboard = toggle_picks_leaderboard_visibility_flexible.show_on_leaderboard
        WHERE user_id = target_user_id 
        AND season = target_season 
        AND week = target_week;
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'affected_picks', picks_updated,
        'operation_status', CASE 
            WHEN picks_updated > 0 THEN 'Updated ' || picks_updated || ' picks'
            ELSE 'No picks found to update'
        END,
        'admin_user', current_user_record.email,
        'auth_method', CASE WHEN current_user_record.id = auth.uid() THEN 'UUID' ELSE 'email' END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_picks_leaderboard_visibility_flexible(UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Found and Updated Your Existing User Record!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 WHAT HAPPENED:';
    RAISE NOTICE '• Found your existing user record with email kurtiswh@gmail.com';
    RAISE NOTICE '• Updated to ensure admin privileges';
    RAISE NOTICE '• Created flexible auth function as backup';
    RAISE NOTICE '';
    RAISE NOTICE '💡 Check the results above to see if UUID was updated';
    RAISE NOTICE '   If not, the flexible function will work with email matching';
END;
$$;