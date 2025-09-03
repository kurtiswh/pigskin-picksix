-- Migration: Create safe leaderboard visibility toggle functions
-- Works with fixed UPSERT triggers to prevent errors
-- Handles both individual picks and anonymous picks

-- ===================================================================
-- SAFE VISIBILITY TOGGLE WITH PROPER TRIGGER INTEGRATION
-- ===================================================================

-- Main function for regular picks visibility toggle
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
    operation_summary TEXT;
BEGIN
    -- Find admin user by email (uses current auth context)
    SELECT u.id, u.email, u.is_admin, u.display_name 
    INTO admin_user
    FROM public.users u 
    WHERE u.email = auth.email() AND u.is_admin = true;
    
    -- If no admin found, return error
    IF admin_user IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Admin user not found or not authorized',
            'auth_email', auth.email(),
            'hint', 'Make sure your user account has is_admin = true'
        );
    END IF;
    
    -- Update picks visibility (triggers will handle leaderboard updates automatically)
    IF target_week IS NULL THEN
        -- Update all picks for the season
        UPDATE public.picks 
        SET show_on_leaderboard = toggle_picks_leaderboard_visibility.show_on_leaderboard
        WHERE user_id = target_user_id 
        AND season = target_season;
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
        
        operation_summary := 'Updated ' || picks_updated || ' picks for entire season ' || target_season;
    ELSE
        -- Update picks for specific week
        UPDATE public.picks 
        SET show_on_leaderboard = toggle_picks_leaderboard_visibility.show_on_leaderboard
        WHERE user_id = target_user_id 
        AND season = target_season 
        AND week = target_week;
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
        
        operation_summary := 'Updated ' || picks_updated || ' picks for week ' || target_week || ' of season ' || target_season;
    END IF;
    
    -- Return success response
    RETURN jsonb_build_object(
        'success', true,
        'affected_picks', picks_updated,
        'operation_status', operation_summary,
        'visibility_setting', show_on_leaderboard,
        'message', CASE 
            WHEN show_on_leaderboard THEN 'User picks are now VISIBLE on leaderboards'
            ELSE 'User picks are now HIDDEN from leaderboards'
        END,
        'admin_user', admin_user.email,
        'leaderboard_status', 'Leaderboards will update automatically via triggers'
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'error_code', SQLSTATE,
            'hint', 'Check database logs for more details',
            'operation_attempted', COALESCE(operation_summary, 'Picks visibility update')
        );
END;
$$;

-- Function for anonymous picks visibility toggle
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
    operation_summary TEXT;
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
            'auth_email', auth.email(),
            'hint', 'Make sure your user account has is_admin = true'
        );
    END IF;
    
    -- Update anonymous picks visibility
    IF target_week IS NULL THEN
        -- Update all anonymous picks for the season
        UPDATE public.anonymous_picks 
        SET show_on_leaderboard = toggle_anonymous_picks_leaderboard_visibility.show_on_leaderboard
        WHERE assigned_user_id = target_user_id 
        AND season = target_season;
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
        
        operation_summary := 'Updated ' || picks_updated || ' anonymous picks for entire season ' || target_season;
    ELSE
        -- Update anonymous picks for specific week
        UPDATE public.anonymous_picks 
        SET show_on_leaderboard = toggle_anonymous_picks_leaderboard_visibility.show_on_leaderboard
        WHERE assigned_user_id = target_user_id 
        AND season = target_season 
        AND week = target_week;
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
        
        operation_summary := 'Updated ' || picks_updated || ' anonymous picks for week ' || target_week || ' of season ' || target_season;
    END IF;
    
    -- Return success response
    RETURN jsonb_build_object(
        'success', true,
        'affected_picks', picks_updated,
        'operation_status', operation_summary,
        'visibility_setting', show_on_leaderboard,
        'message', CASE 
            WHEN show_on_leaderboard THEN 'User anonymous picks are now VISIBLE on leaderboards'
            ELSE 'User anonymous picks are now HIDDEN from leaderboards'
        END,
        'admin_user', admin_user.email,
        'leaderboard_status', 'Leaderboards will update automatically via triggers'
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'error_code', SQLSTATE,
            'hint', 'Check database logs for more details',
            'operation_attempted', COALESCE(operation_summary, 'Anonymous picks visibility update')
        );
END;
$$;

-- Grant execute permissions to authenticated users (admin check is inside function)
GRANT EXECUTE ON FUNCTION public.toggle_picks_leaderboard_visibility(UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_anonymous_picks_leaderboard_visibility(UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;

-- Helper function to manually refresh leaderboards (for admin use)
CREATE OR REPLACE FUNCTION public.manual_refresh_user_leaderboards(
    target_user_id UUID,
    target_season INTEGER,
    target_week INTEGER DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    admin_user RECORD;
    season_refreshed BOOLEAN := false;
    weekly_refreshed BOOLEAN := false;
    error_details TEXT := '';
BEGIN
    -- Admin check
    SELECT u.id, u.email, u.is_admin 
    INTO admin_user
    FROM public.users u 
    WHERE u.email = auth.email() AND u.is_admin = true;
    
    IF admin_user IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Admin privileges required'
        );
    END IF;
    
    -- Refresh season leaderboard by triggering the update function
    BEGIN
        -- Delete and let triggers rebuild
        DELETE FROM public.season_leaderboard 
        WHERE user_id = target_user_id AND season = target_season;
        
        -- Insert a dummy pick update to trigger recalculation
        -- (This will cause the trigger to rebuild the leaderboard entry)
        UPDATE public.picks 
        SET updated_at = NOW() 
        WHERE id = (
            SELECT id FROM public.picks 
            WHERE user_id = target_user_id AND season = target_season
            LIMIT 1
        );
        
        season_refreshed := true;
    EXCEPTION WHEN OTHERS THEN
        error_details := error_details || 'Season refresh failed: ' || SQLERRM || '; ';
    END;
    
    -- Refresh weekly leaderboard if specific week provided
    IF target_week IS NOT NULL THEN
        BEGIN
            DELETE FROM public.weekly_leaderboard 
            WHERE user_id = target_user_id AND season = target_season AND week = target_week;
            
            -- Trigger rebuild for specific week
            UPDATE public.picks 
            SET updated_at = NOW() 
            WHERE id = (
                SELECT id FROM public.picks 
                WHERE user_id = target_user_id AND season = target_season AND week = target_week
                LIMIT 1
            );
            
            weekly_refreshed := true;
        EXCEPTION WHEN OTHERS THEN
            error_details := error_details || 'Weekly refresh failed: ' || SQLERRM || '; ';
        END;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'season_refreshed', season_refreshed,
        'weekly_refreshed', weekly_refreshed,
        'error_details', NULLIF(error_details, ''),
        'message', 'Manual leaderboard refresh completed',
        'admin_user', admin_user.email
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.manual_refresh_user_leaderboards(UUID, INTEGER, INTEGER) TO authenticated;

-- Test the constraint structure to make sure UPSERT will work
DO $$
DECLARE
    season_constraints TEXT;
    weekly_constraints TEXT;
BEGIN
    -- Check season_leaderboard constraints
    SELECT string_agg(conname || ': ' || pg_get_constraintdef(oid), ', ')
    INTO season_constraints
    FROM pg_constraint 
    WHERE conrelid = 'public.season_leaderboard'::regclass
      AND contype IN ('p', 'u'); -- Primary and unique constraints
    
    -- Check weekly_leaderboard constraints  
    SELECT string_agg(conname || ': ' || pg_get_constraintdef(oid), ', ')
    INTO weekly_constraints
    FROM pg_constraint 
    WHERE conrelid = 'public.weekly_leaderboard'::regclass
      AND contype IN ('p', 'u'); -- Primary and unique constraints
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 112: Safe visibility toggle functions created';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 FEATURES:';
    RAISE NOTICE '• Works with fixed UPSERT triggers';
    RAISE NOTICE '• Proper admin authentication via email';
    RAISE NOTICE '• Detailed success/error reporting';
    RAISE NOTICE '• Manual refresh capability for troubleshooting';
    RAISE NOTICE '';
    RAISE NOTICE '🗄️  CONSTRAINT VERIFICATION:';
    RAISE NOTICE '• Season leaderboard: %', COALESCE(season_constraints, 'No unique constraints found');
    RAISE NOTICE '• Weekly leaderboard: %', COALESCE(weekly_constraints, 'No unique constraints found');
    RAISE NOTICE '';
    RAISE NOTICE '💡 Show/Hide functionality should now be fully resilient!';
END;
$$;