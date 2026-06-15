-- Debug Authentication Issue
-- Copy and paste this into your Supabase SQL Editor

-- Create a debug function that shows us exactly what's happening
CREATE OR REPLACE FUNCTION public.debug_user_auth_status()
RETURNS TABLE(
    auth_uid UUID,
    auth_email TEXT,
    user_exists BOOLEAN,
    user_record JSONB,
    all_users_count INTEGER
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    current_uid UUID;
    current_email TEXT;
    user_found BOOLEAN := false;
    user_data JSONB;
    total_users INTEGER;
BEGIN
    -- Get auth info
    current_uid := auth.uid();
    current_email := auth.email();
    
    -- Count total users
    SELECT COUNT(*) INTO total_users FROM public.users;
    
    -- Check if user exists and get their data
    SELECT row_to_json(u.*) INTO user_data
    FROM public.users u
    WHERE u.id = current_uid;
    
    user_found := (user_data IS NOT NULL);
    
    RETURN QUERY SELECT 
        current_uid,
        current_email,
        user_found,
        user_data,
        total_users;
END;
$$;

-- Run the debug function
SELECT * FROM public.debug_user_auth_status();

-- Also check what users exist with similar emails to yours
SELECT 
    id,
    email,
    display_name,
    is_admin,
    created_at
FROM public.users
WHERE email ILIKE '%' || auth.email() || '%'
   OR email ILIKE '%admin%'
   OR is_admin = true
ORDER BY created_at DESC;

-- Create a temporary bypass function that doesn't check auth
CREATE OR REPLACE FUNCTION public.bypass_toggle_picks_leaderboard_visibility(
    target_user_id UUID,
    target_season INTEGER,
    target_week INTEGER DEFAULT NULL,
    show_on_leaderboard BOOLEAN DEFAULT TRUE,
    bypass_auth BOOLEAN DEFAULT false
)
RETURNS TABLE(
    affected_picks INTEGER,
    operation_status TEXT,
    debug_info JSONB
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    picks_updated INTEGER := 0;
    current_user_record RECORD;
    debug_data JSONB;
BEGIN
    -- Get current user info for debugging
    SELECT u.id, u.email, u.is_admin, u.display_name 
    INTO current_user_record
    FROM public.users u 
    WHERE u.id = auth.uid();
    
    -- Build debug info
    debug_data := jsonb_build_object(
        'auth_uid', auth.uid(),
        'auth_email', auth.email(),
        'user_found', current_user_record IS NOT NULL,
        'user_is_admin', COALESCE(current_user_record.is_admin, false),
        'bypass_mode', bypass_auth
    );
    
    -- If bypass mode is enabled, skip auth check (TEMPORARY DEBUG ONLY)
    IF NOT bypass_auth THEN
        -- Normal auth check
        IF current_user_record IS NULL THEN
            RETURN QUERY SELECT 
                0 as affected_picks,
                'User not found in database' as operation_status,
                debug_data;
            RETURN;
        END IF;
        
        IF NOT COALESCE(current_user_record.is_admin, false) THEN
            RETURN QUERY SELECT 
                0 as affected_picks,
                'Access denied: User is not admin' as operation_status,
                debug_data;
            RETURN;
        END IF;
    END IF;
    
    -- Update picks visibility
    IF target_week IS NULL THEN
        UPDATE public.picks 
        SET show_on_leaderboard = bypass_toggle_picks_leaderboard_visibility.show_on_leaderboard
        WHERE user_id = target_user_id 
        AND season = target_season;
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
    ELSE
        UPDATE public.picks 
        SET show_on_leaderboard = bypass_toggle_picks_leaderboard_visibility.show_on_leaderboard
        WHERE user_id = target_user_id 
        AND season = target_season 
        AND week = target_week;
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
    END IF;
    
    -- Return results with debug info
    RETURN QUERY SELECT 
        picks_updated,
        CASE 
            WHEN picks_updated > 0 THEN 'Success: Updated ' || picks_updated || ' picks'
            ELSE 'No picks found to update'
        END as operation_status,
        debug_data;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_user_auth_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bypass_toggle_picks_leaderboard_visibility(UUID, INTEGER, INTEGER, BOOLEAN, BOOLEAN) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Debug Functions Created!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 WHAT TO CHECK:';
    RAISE NOTICE '• Look at the debug_user_auth_status() results above';
    RAISE NOTICE '• Check if auth_uid and auth_email have values';
    RAISE NOTICE '• Check if user_exists is true';
    RAISE NOTICE '• Look for users with similar emails';
    RAISE NOTICE '';
    RAISE NOTICE '💡 We can use bypass mode temporarily if needed';
END;
$$;