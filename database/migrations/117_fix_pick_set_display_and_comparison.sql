-- Migration 117: Fix Pick Set Display and Enable Comparison
-- 
-- PURPOSE: Fix column name error and enable side-by-side pick set comparison
-- - Fix game_time -> kickoff_time
-- - Create function to get ALL pick sets for a user/week for comparison

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 117: Fix pick set display and enable comparison';
    RAISE NOTICE '================================================================';
END;
$$;

-- Fix the get_pick_set_with_games function to use correct column name
CREATE OR REPLACE FUNCTION public.get_pick_set_with_games(
    target_user_id UUID,
    target_season INTEGER,
    target_week INTEGER,
    pick_set_id TEXT
)
RETURNS TABLE(
    pick_set_info JSONB,
    picks_with_games JSONB
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    pick_set_type VARCHAR(20);
    pick_set_email TEXT;
BEGIN
    -- Parse pick set ID
    IF pick_set_id = 'auth' THEN
        pick_set_type := 'authenticated';
        pick_set_email := NULL;
    ELSE
        pick_set_type := 'anonymous';
        pick_set_email := SUBSTRING(pick_set_id FROM 6); -- Remove 'anon:' prefix
    END IF;
    
    IF pick_set_type = 'authenticated' THEN
        -- Get authenticated picks with game details
        RETURN QUERY
        SELECT 
            JSONB_BUILD_OBJECT(
                'pick_set_id', pick_set_id,
                'pick_set_type', 'authenticated',
                'source', 'User Account',
                'total_picks', COUNT(*),
                'lock_picks', COUNT(CASE WHEN p.is_lock THEN 1 END),
                'submitted_at', MAX(p.submitted_at)
            ) as pick_set_info,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'pick_id', p.id,
                    'selected_team', p.selected_team,
                    'is_lock', p.is_lock,
                    'points_earned', p.points_earned,
                    'result', p.result,
                    'created_at', p.created_at,
                    'game', JSONB_BUILD_OBJECT(
                        'id', g.id,
                        'home_team', g.home_team,
                        'away_team', g.away_team,
                        'spread', g.spread,
                        'home_score', g.home_score,
                        'away_score', g.away_score,
                        'status', g.status,
                        'kickoff_time', g.kickoff_time
                    )
                ) ORDER BY p.is_lock DESC, g.kickoff_time
            ) as picks_with_games
        FROM public.picks p
        JOIN public.games g ON p.game_id = g.id
        WHERE p.user_id = target_user_id 
          AND p.season = target_season 
          AND p.week = target_week
          AND p.submitted_at IS NOT NULL;
    ELSE
        -- Get anonymous picks with game details
        RETURN QUERY
        SELECT 
            JSONB_BUILD_OBJECT(
                'pick_set_id', pick_set_id,
                'pick_set_type', 'anonymous',
                'source', pick_set_email,
                'total_picks', COUNT(*),
                'lock_picks', COUNT(CASE WHEN ap.is_lock THEN 1 END),
                'submitted_at', MIN(ap.created_at)
            ) as pick_set_info,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'pick_id', ap.id,
                    'selected_team', ap.selected_team,
                    'is_lock', ap.is_lock,
                    'points_earned', COALESCE(ap.points_earned, 0),
                    'result', 'pending',
                    'created_at', ap.created_at,
                    'game', JSONB_BUILD_OBJECT(
                        'id', g.id,
                        'home_team', g.home_team,
                        'away_team', g.away_team,
                        'spread', g.spread,
                        'home_score', g.home_score,
                        'away_score', g.away_score,
                        'status', g.status,
                        'kickoff_time', g.kickoff_time
                    )
                ) ORDER BY ap.is_lock DESC, g.kickoff_time
            ) as picks_with_games
        FROM public.anonymous_picks ap
        JOIN public.games g ON ap.game_id = g.id
        WHERE ap.assigned_user_id = target_user_id 
          AND ap.season = target_season 
          AND ap.week = target_week
          AND ap.email = pick_set_email
          AND ap.show_on_leaderboard = true
          AND ap.validation_status IN ('auto_validated', 'manually_validated');
    END IF;
END;
$$;

-- Create function to get ALL pick sets for a user/week for comparison
CREATE OR REPLACE FUNCTION public.get_all_pick_sets_for_comparison(
    target_user_id UUID,
    target_season INTEGER,
    target_week INTEGER
)
RETURNS TABLE(
    pick_set_comparison JSONB
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH all_pick_sets AS (
        -- Authenticated picks
        SELECT 
            'auth' as pick_set_id,
            'authenticated' as pick_set_type,
            'User Account' as source,
            COUNT(*) as pick_count,
            COUNT(CASE WHEN p.is_lock THEN 1 END) as lock_count,
            MAX(p.submitted_at) as submitted_at,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'pick_id', p.id,
                    'selected_team', p.selected_team,
                    'is_lock', p.is_lock,
                    'points_earned', p.points_earned,
                    'result', p.result,
                    'created_at', p.created_at,
                    'game', JSONB_BUILD_OBJECT(
                        'id', g.id,
                        'home_team', g.home_team,
                        'away_team', g.away_team,
                        'spread', g.spread,
                        'home_score', g.home_score,
                        'away_score', g.away_score,
                        'status', g.status,
                        'kickoff_time', g.kickoff_time
                    )
                ) ORDER BY p.is_lock DESC, g.kickoff_time
            ) as picks_detail
        FROM public.picks p
        JOIN public.games g ON p.game_id = g.id
        WHERE p.user_id = target_user_id 
          AND p.season = target_season 
          AND p.week = target_week
          AND p.submitted_at IS NOT NULL
        GROUP BY p.user_id
        HAVING COUNT(*) > 0
        
        UNION ALL
        
        -- Anonymous picks (grouped by email)
        SELECT 
            'anon:' || ap.email as pick_set_id,
            'anonymous' as pick_set_type,
            ap.email as source,
            COUNT(*) as pick_count,
            COUNT(CASE WHEN ap.is_lock THEN 1 END) as lock_count,
            MIN(ap.created_at) as submitted_at,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'pick_id', ap.id,
                    'selected_team', ap.selected_team,
                    'is_lock', ap.is_lock,
                    'points_earned', COALESCE(ap.points_earned, 0),
                    'result', 'pending',
                    'created_at', ap.created_at,
                    'game', JSONB_BUILD_OBJECT(
                        'id', g.id,
                        'home_team', g.home_team,
                        'away_team', g.away_team,
                        'spread', g.spread,
                        'home_score', g.home_score,
                        'away_score', g.away_score,
                        'status', g.status,
                        'kickoff_time', g.kickoff_time
                    )
                ) ORDER BY ap.is_lock DESC, g.kickoff_time
            ) as picks_detail
        FROM public.anonymous_picks ap
        JOIN public.games g ON ap.game_id = g.id
        WHERE ap.assigned_user_id = target_user_id 
          AND ap.season = target_season 
          AND ap.week = target_week
          AND ap.show_on_leaderboard = true
          AND ap.validation_status IN ('auto_validated', 'manually_validated')
        GROUP BY ap.email
        HAVING COUNT(*) > 0
    )
    SELECT 
        JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'pick_set_id', aps.pick_set_id,
                'pick_set_type', aps.pick_set_type,
                'source', aps.source,
                'pick_count', aps.pick_count,
                'lock_count', aps.lock_count,
                'submitted_at', aps.submitted_at,
                'picks', aps.picks_detail
            ) ORDER BY aps.pick_set_type, aps.source
        ) as pick_set_comparison
    FROM all_pick_sets aps;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_all_pick_sets_for_comparison(UUID, INTEGER, INTEGER) TO authenticated;

-- Update comments
COMMENT ON FUNCTION public.get_pick_set_with_games(UUID, INTEGER, INTEGER, TEXT) IS 'Get detailed pick information for a specific pick set (FIXED: uses kickoff_time)';
COMMENT ON FUNCTION public.get_all_pick_sets_for_comparison(UUID, INTEGER, INTEGER) IS 'Get all pick sets for a user/week for side-by-side comparison';

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 117 COMPLETED - Fixed pick set display and comparison!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 FIXES APPLIED:';
    RAISE NOTICE '• Fixed column name: game_time -> kickoff_time';
    RAISE NOTICE '• Added get_all_pick_sets_for_comparison() for side-by-side view';
    RAISE NOTICE '• Enhanced pick details with creation timestamps';
    RAISE NOTICE '• Proper ordering by lock status and game time';
    RAISE NOTICE '';
    RAISE NOTICE '📝 Now admin can see all pick sets simultaneously for comparison!';
END;
$$;