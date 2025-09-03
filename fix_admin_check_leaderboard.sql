-- Fix Admin Check for Leaderboard Visibility Functions
-- Copy and paste this into your Supabase SQL Editor

-- Create a more robust version of the toggle function that works with your admin setup
CREATE OR REPLACE FUNCTION public.toggle_picks_leaderboard_visibility(
    target_user_id UUID,
    target_season INTEGER,
    target_week INTEGER DEFAULT NULL,
    show_on_leaderboard BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
    affected_picks INTEGER,
    operation_status TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    picks_updated INTEGER := 0;
    current_user_record RECORD;
BEGIN
    -- Get current user info with better error handling
    SELECT u.id, u.email, u.is_admin, u.display_name 
    INTO current_user_record
    FROM public.users u 
    WHERE u.id = auth.uid();
    
    -- Check if user exists and is admin
    IF current_user_record IS NULL THEN
        RAISE EXCEPTION 'User not found in database';
    END IF;
    
    IF NOT COALESCE(current_user_record.is_admin, false) THEN
        RAISE EXCEPTION 'Access denied: User % (%) does not have admin privileges', 
            current_user_record.email, current_user_record.display_name;
    END IF;
    
    -- Update picks visibility
    IF target_week IS NULL THEN
        -- Update all weeks for the season
        UPDATE public.picks 
        SET show_on_leaderboard = toggle_picks_leaderboard_visibility.show_on_leaderboard
        WHERE user_id = target_user_id 
        AND season = target_season;
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
    ELSE
        -- Update specific week
        UPDATE public.picks 
        SET show_on_leaderboard = toggle_picks_leaderboard_visibility.show_on_leaderboard
        WHERE user_id = target_user_id 
        AND season = target_season 
        AND week = target_week;
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
    END IF;
    
    -- Return results
    RETURN QUERY SELECT 
        picks_updated as affected_picks,
        CASE 
            WHEN picks_updated > 0 THEN 'Success: Updated ' || picks_updated || ' picks for user'
            ELSE 'No picks found to update for specified criteria'
        END as operation_status;
        
    -- Log the operation for debugging
    RAISE NOTICE 'Admin % updated % picks for user % (season %, week %)', 
        current_user_record.email, picks_updated, target_user_id, target_season, target_week;
END;
$$;

-- Create the anonymous picks version with same improved logic
CREATE OR REPLACE FUNCTION public.toggle_anonymous_picks_leaderboard_visibility(
    target_user_id UUID,
    target_season INTEGER,
    target_week INTEGER DEFAULT NULL,
    show_on_leaderboard BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
    affected_picks INTEGER,
    operation_status TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    picks_updated INTEGER := 0;
    current_user_record RECORD;
BEGIN
    -- Get current user info with better error handling
    SELECT u.id, u.email, u.is_admin, u.display_name 
    INTO current_user_record
    FROM public.users u 
    WHERE u.id = auth.uid();
    
    -- Check if user exists and is admin
    IF current_user_record IS NULL THEN
        RAISE EXCEPTION 'User not found in database';
    END IF;
    
    IF NOT COALESCE(current_user_record.is_admin, false) THEN
        RAISE EXCEPTION 'Access denied: User % (%) does not have admin privileges', 
            current_user_record.email, current_user_record.display_name;
    END IF;
    
    -- Update anonymous picks visibility
    IF target_week IS NULL THEN
        -- Update all weeks for the season
        UPDATE public.anonymous_picks 
        SET show_on_leaderboard = toggle_anonymous_picks_leaderboard_visibility.show_on_leaderboard
        WHERE assigned_user_id = target_user_id 
        AND season = target_season;
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
    ELSE
        -- Update specific week
        UPDATE public.anonymous_picks 
        SET show_on_leaderboard = toggle_anonymous_picks_leaderboard_visibility.show_on_leaderboard
        WHERE assigned_user_id = target_user_id 
        AND season = target_season 
        AND week = target_week;
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
    END IF;
    
    -- Return results
    RETURN QUERY SELECT 
        picks_updated as affected_picks,
        CASE 
            WHEN picks_updated > 0 THEN 'Success: Updated ' || picks_updated || ' anonymous picks for user'
            ELSE 'No anonymous picks found to update for specified criteria'
        END as operation_status;
        
    -- Log the operation for debugging
    RAISE NOTICE 'Admin % updated % anonymous picks for user % (season %, week %)', 
        current_user_record.email, picks_updated, target_user_id, target_season, target_week;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.toggle_picks_leaderboard_visibility(UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_anonymous_picks_leaderboard_visibility(UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;

-- Test query to verify your admin status
SELECT 
    u.id,
    u.email,
    u.display_name,
    u.is_admin,
    auth.uid() as current_auth_uid,
    auth.email() as current_auth_email,
    (u.id = auth.uid()) as auth_uid_matches
FROM public.users u 
WHERE u.id = auth.uid() OR u.email = auth.email();

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Improved Admin Check Functions Created!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 IMPROVEMENTS:';
    RAISE NOTICE '• Better error messages showing which user lacks admin privileges';
    RAISE NOTICE '• More detailed logging of operations';
    RAISE NOTICE '• Improved null handling for admin status';
    RAISE NOTICE '';
    RAISE NOTICE '🧪 CHECK YOUR ADMIN STATUS:';
    RAISE NOTICE '• Look at the test query results above';
    RAISE NOTICE '• Ensure is_admin = true and auth_uid_matches = true';
END;
$$;