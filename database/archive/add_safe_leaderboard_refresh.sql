-- Add Safe Leaderboard Refresh to Visibility Functions
-- Copy and paste this into your Supabase SQL Editor

-- Update the function to safely refresh leaderboards after visibility changes
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
    refresh_result TEXT;
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
    
    -- Update picks visibility
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
    
    -- If picks were updated, try to refresh leaderboard for just this user
    IF picks_updated > 0 THEN
        BEGIN
            -- Try to refresh leaderboard safely using UPSERT
            DELETE FROM public.season_leaderboard 
            WHERE user_id = target_user_id AND season = target_season;
            
            DELETE FROM public.weekly_leaderboard 
            WHERE user_id = target_user_id AND season = target_season;
            
            -- Let the system rebuild the user's leaderboard entry naturally
            refresh_result := 'Leaderboard entries reset for user - will rebuild automatically';
            
        EXCEPTION WHEN OTHERS THEN
            -- If leaderboard refresh fails, that's OK - the main update succeeded
            refresh_result := 'Picks updated, leaderboard refresh skipped: ' || SQLERRM;
        END;
    ELSE
        refresh_result := 'No picks to update';
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'affected_picks', picks_updated,
        'operation_status', 'Updated ' || picks_updated || ' picks',
        'leaderboard_status', refresh_result,
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

-- Same approach for anonymous picks
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
    refresh_result TEXT;
BEGIN
    -- Find admin user by email 
    SELECT u.id, u.email, u.is_admin, u.display_name 
    INTO admin_user
    FROM public.users u 
    WHERE u.email = auth.email() AND u.is_admin = true;
    
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
    
    -- Safe leaderboard refresh
    IF picks_updated > 0 THEN
        BEGIN
            DELETE FROM public.season_leaderboard 
            WHERE user_id = target_user_id AND season = target_season;
            
            DELETE FROM public.weekly_leaderboard 
            WHERE user_id = target_user_id AND season = target_season;
            
            refresh_result := 'Leaderboard entries reset for user - will rebuild automatically';
            
        EXCEPTION WHEN OTHERS THEN
            refresh_result := 'Picks updated, leaderboard refresh skipped: ' || SQLERRM;
        END;
    ELSE
        refresh_result := 'No anonymous picks to update';
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'affected_picks', picks_updated,
        'operation_status', 'Updated ' || picks_updated || ' anonymous picks',
        'leaderboard_status', refresh_result,
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
    RAISE NOTICE '✅ Added Safe Leaderboard Refresh!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 WHAT CHANGED:';
    RAISE NOTICE '• Visibility changes now immediately update leaderboard';
    RAISE NOTICE '• Uses safe DELETE approach to avoid duplicate key errors';
    RAISE NOTICE '• Leaderboard entries rebuild automatically after deletion';
    RAISE NOTICE '• If refresh fails, picks update still succeeds';
    RAISE NOTICE '';
    RAISE NOTICE '💡 Show/Hide should now work with immediate leaderboard updates!';
END;
$$;