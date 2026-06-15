-- Quick Fix: Add show_on_leaderboard column to picks table
-- Copy and paste this into your Supabase SQL Editor

-- Add the missing column
ALTER TABLE public.picks 
ADD COLUMN IF NOT EXISTS show_on_leaderboard BOOLEAN DEFAULT TRUE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_picks_show_on_leaderboard 
ON public.picks(show_on_leaderboard);

-- Create the toggle function that the UI expects
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
BEGIN
    -- Only admins can call this function
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = TRUE) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
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
            WHEN picks_updated > 0 THEN 'Success: Updated ' || picks_updated || ' picks'
            ELSE 'No picks found to update'
        END as operation_status;
END;
$$;

-- Create the anonymous picks toggle function 
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
BEGIN
    -- Only admins can call this function
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = TRUE) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
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
            WHEN picks_updated > 0 THEN 'Success: Updated ' || picks_updated || ' picks'
            ELSE 'No picks found to update'
        END as operation_status;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.toggle_picks_leaderboard_visibility(UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_anonymous_picks_leaderboard_visibility(UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Quick Fix Applied Successfully!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 CHANGES MADE:';
    RAISE NOTICE '• Added show_on_leaderboard column to picks table';
    RAISE NOTICE '• Created toggle_picks_leaderboard_visibility function';
    RAISE NOTICE '• Created toggle_anonymous_picks_leaderboard_visibility function';
    RAISE NOTICE '';
    RAISE NOTICE '💡 The leaderboard visibility controls should now work!';
END;
$$;