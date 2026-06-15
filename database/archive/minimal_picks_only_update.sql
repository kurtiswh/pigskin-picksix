-- Minimal Picks-Only Update (No Leaderboard Operations)
-- Copy and paste this into your Supabase SQL Editor

-- Create a simple version that ONLY updates picks, no leaderboard operations at all
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
    -- Find admin user by email
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
    
    -- DISABLE any triggers that might cause leaderboard updates
    SET session_replication_role = replica;
    
    -- Update picks visibility WITHOUT triggering any cascades
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
    
    -- RE-ENABLE triggers
    SET session_replication_role = DEFAULT;
    
    RETURN jsonb_build_object(
        'success', true,
        'affected_picks', picks_updated,
        'operation_status', 'Updated ' || picks_updated || ' picks (triggers disabled)',
        'message', 'Picks updated successfully. Leaderboard will refresh when you reload the page.',
        'admin_user', admin_user.email
    );
    
EXCEPTION
    WHEN OTHERS THEN
        -- Make sure to re-enable triggers even if there's an error
        SET session_replication_role = DEFAULT;
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
    
    -- DISABLE triggers to prevent leaderboard cascades
    SET session_replication_role = replica;
    
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
    
    -- RE-ENABLE triggers
    SET session_replication_role = DEFAULT;
    
    RETURN jsonb_build_object(
        'success', true,
        'affected_picks', picks_updated,
        'operation_status', 'Updated ' || picks_updated || ' anonymous picks (triggers disabled)',
        'message', 'Anonymous picks updated successfully. Leaderboard will refresh when you reload the page.',
        'admin_user', admin_user.email
    );
    
EXCEPTION
    WHEN OTHERS THEN
        -- Make sure to re-enable triggers even if there's an error
        SET session_replication_role = DEFAULT;
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'error_code', SQLSTATE
        );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_picks_leaderboard_visibility(UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_anonymous_picks_leaderboard_visibility(UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;

-- Also check what triggers exist that might be causing the duplicate issue
SELECT 
    trigger_name,
    event_object_table,
    action_timing,
    event_manipulation,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table IN ('picks', 'anonymous_picks')
   OR action_statement LIKE '%leaderboard%'
ORDER BY event_object_table, trigger_name;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Minimal Picks-Only Update Created!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 WHAT THIS DOES:';
    RAISE NOTICE '• Temporarily disables ALL triggers during update';
    RAISE NOTICE '• Updates ONLY the pick visibility flags';
    RAISE NOTICE '• Re-enables triggers after update';
    RAISE NOTICE '• No automatic leaderboard operations';
    RAISE NOTICE '';
    RAISE NOTICE '📊 CHECK THE TRIGGER LIST ABOVE:';
    RAISE NOTICE '• Look for triggers on picks/anonymous_picks tables';
    RAISE NOTICE '• These might be causing the duplicate key errors';
    RAISE NOTICE '';
    RAISE NOTICE '💡 This should eliminate the duplicate key error completely!';
END;
$$;