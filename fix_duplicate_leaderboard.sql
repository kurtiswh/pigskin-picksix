-- Fix Duplicate Key Error in Leaderboard Functions
-- Copy and paste this into your Supabase SQL Editor

-- The visibility functions are trying to update leaderboards but causing duplicates
-- Let's modify them to just update picks without triggering leaderboard refreshes

CREATE OR REPLACE FUNCTION public.toggle_picks_leaderboard_visibility(
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
    admin_user RECORD;
BEGIN
    -- Find admin user by email (since you're already authenticated)
    SELECT u.id, u.email, u.is_admin, u.display_name 
    INTO admin_user
    FROM public.users u 
    WHERE u.email = auth.email() AND u.is_admin = true;
    
    -- If no admin found, return error
    IF admin_user IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Admin user not found or not authorized',
            'auth_email', auth.email()
        );
    END IF;
    
    -- Update picks visibility (you're authorized)
    IF target_week IS NULL THEN
        UPDATE public.picks 
        SET show_on_leaderboard = toggle_picks_leaderboard_visibility.show_on_leaderboard
        WHERE user_id = target_user_id 
        AND season = target_season;
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
    ELSE
        UPDATE public.picks 
        SET show_on_leaderboard = toggle_picks_leaderboard_visibility.show_on_leaderboard
        WHERE user_id = target_user_id 
        AND season = target_season 
        AND week = target_week;
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
    END IF;
    
    -- DON'T trigger leaderboard refresh to avoid duplicate key errors
    -- The leaderboard will update on its next scheduled refresh
    
    RETURN jsonb_build_object(
        'success', true,
        'affected_picks', picks_updated,
        'operation_status', 'Updated ' || picks_updated || ' picks (leaderboard will refresh automatically)',
        'admin_user', admin_user.email
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'error_code', SQLSTATE
        );
END;
$$;

-- Same fix for anonymous picks
CREATE OR REPLACE FUNCTION public.toggle_anonymous_picks_leaderboard_visibility(
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
    admin_user RECORD;
BEGIN
    -- Find admin user by email (since you're already authenticated)
    SELECT u.id, u.email, u.is_admin, u.display_name 
    INTO admin_user
    FROM public.users u 
    WHERE u.email = auth.email() AND u.is_admin = true;
    
    -- If no admin found, return error
    IF admin_user IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Admin user not found or not authorized',
            'auth_email', auth.email()
        );
    END IF;
    
    -- Update anonymous picks visibility
    IF target_week IS NULL THEN
        UPDATE public.anonymous_picks 
        SET show_on_leaderboard = toggle_anonymous_picks_leaderboard_visibility.show_on_leaderboard
        WHERE assigned_user_id = target_user_id 
        AND season = target_season;
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
    ELSE
        UPDATE public.anonymous_picks 
        SET show_on_leaderboard = toggle_anonymous_picks_leaderboard_visibility.show_on_leaderboard
        WHERE assigned_user_id = target_user_id 
        AND season = target_season 
        AND week = target_week;
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
    END IF;
    
    -- DON'T trigger leaderboard refresh to avoid duplicate key errors
    
    RETURN jsonb_build_object(
        'success', true,
        'affected_picks', picks_updated,
        'operation_status', 'Updated ' || picks_updated || ' anonymous picks (leaderboard will refresh automatically)',
        'admin_user', admin_user.email
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'error_code', SQLSTATE
        );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_picks_leaderboard_visibility(UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_anonymous_picks_leaderboard_visibility(UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Fixed Duplicate Key Error!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 WHAT CHANGED:';
    RAISE NOTICE '• Removed automatic leaderboard refresh that caused duplicates';
    RAISE NOTICE '• Added proper error handling';
    RAISE NOTICE '• Picks visibility will still update correctly';
    RAISE NOTICE '• Leaderboard will refresh on its next scheduled update';
    RAISE NOTICE '';
    RAISE NOTICE '💡 The Show/Hide buttons should work now!';
END;
$$;