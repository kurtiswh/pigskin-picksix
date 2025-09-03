-- Fix Function Overloading Issue
-- Copy and paste this into your Supabase SQL Editor

-- Drop all existing versions of the conflicting functions to resolve overloading
DROP FUNCTION IF EXISTS public.toggle_anonymous_picks_leaderboard_visibility(UUID, INTEGER, INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS public.toggle_anonymous_picks_leaderboard_visibility(UUID, INTEGER, INTEGER, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.toggle_picks_leaderboard_visibility(UUID, INTEGER, INTEGER, BOOLEAN);

-- Create clean, single-purpose functions
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
    current_user_record RECORD;
BEGIN
    -- Get current user info
    SELECT u.id, u.email, u.is_admin, u.display_name 
    INTO current_user_record
    FROM public.users u 
    WHERE u.id = auth.uid();
    
    -- Check if user exists and is admin
    IF current_user_record IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found in database',
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
    
    RETURN jsonb_build_object(
        'success', true,
        'affected_picks', picks_updated,
        'operation_status', CASE 
            WHEN picks_updated > 0 THEN 'Updated ' || picks_updated || ' picks'
            ELSE 'No picks found to update'
        END,
        'admin_user', current_user_record.email
    );
END;
$$;

-- Create clean anonymous picks function
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
    current_user_record RECORD;
BEGIN
    -- Get current user info
    SELECT u.id, u.email, u.is_admin, u.display_name 
    INTO current_user_record
    FROM public.users u 
    WHERE u.id = auth.uid();
    
    -- Check if user exists and is admin
    IF current_user_record IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found in database',
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
    
    RETURN jsonb_build_object(
        'success', true,
        'affected_picks', picks_updated,
        'operation_status', CASE 
            WHEN picks_updated > 0 THEN 'Updated ' || picks_updated || ' anonymous picks'
            ELSE 'No anonymous picks found to update'
        END,
        'admin_user', current_user_record.email
    );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.toggle_picks_leaderboard_visibility(UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_anonymous_picks_leaderboard_visibility(UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Function Overloading Issue Fixed!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 CHANGES MADE:';
    RAISE NOTICE '• Dropped all conflicting function versions';
    RAISE NOTICE '• Created single, clean versions of each function';
    RAISE NOTICE '• Functions now return detailed JSONB responses';
    RAISE NOTICE '• Better error messages with auth debugging info';
    RAISE NOTICE '';
    RAISE NOTICE '💡 Try the leaderboard controls again!';
END;
$$;