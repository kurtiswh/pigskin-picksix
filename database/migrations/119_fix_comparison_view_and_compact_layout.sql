-- Migration 119: Fix Comparison View and Compact Layout
-- 
-- PURPOSE: Fix issues with missing pick sets in comparison view

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 119: Fix comparison view and compact layout';
    RAISE NOTICE '=============================================================';
END;
$$;

-- Fix the comparison function to ensure both authenticated and anonymous picks show up
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
        -- Authenticated picks (even if user has admin selection)
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
        
        -- Anonymous picks (all sets, regardless of show_on_leaderboard status for comparison)
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
          AND ap.validation_status IN ('auto_validated', 'manually_validated')
          -- Don't filter by show_on_leaderboard here - we want to see ALL sets for comparison
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
            ) ORDER BY aps.pick_set_type DESC, aps.source  -- authenticated first, then anon by email
        ) as pick_set_comparison
    FROM all_pick_sets aps;
END;
$$;

-- Add debug function to check what's happening with specific users
CREATE OR REPLACE FUNCTION public.debug_user_pick_sets(
    target_user_id UUID,
    target_season INTEGER DEFAULT 2025,
    target_week INTEGER DEFAULT 1
)
RETURNS TABLE(
    debug_info JSONB
)
SECURITY DEFINER  
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH debug_data AS (
        SELECT 
            'authenticated_picks' as data_type,
            COUNT(*) as count,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'id', p.id,
                    'submitted_at', p.submitted_at,
                    'selected_team', p.selected_team,
                    'is_lock', p.is_lock
                )
            ) as details
        FROM public.picks p
        WHERE p.user_id = target_user_id 
          AND p.season = target_season 
          AND p.week = target_week
        
        UNION ALL
        
        SELECT 
            'anonymous_picks' as data_type,
            COUNT(*) as count,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'id', ap.id,
                    'email', ap.email,
                    'assigned_user_id', ap.assigned_user_id,
                    'show_on_leaderboard', ap.show_on_leaderboard,
                    'validation_status', ap.validation_status,
                    'selected_team', ap.selected_team,
                    'is_lock', ap.is_lock
                )
            ) as details
        FROM public.anonymous_picks ap
        WHERE ap.assigned_user_id = target_user_id 
          AND ap.season = target_season 
          AND ap.week = target_week
        
        UNION ALL
        
        SELECT 
            'admin_selection' as data_type,
            COUNT(*) as count,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'selected_pick_set_id', upsp.selected_pick_set_id,
                    'reasoning', upsp.reasoning,
                    'set_by_admin', upsp.set_by_admin
                )
            ) as details
        FROM public.user_pick_set_preferences upsp
        WHERE upsp.user_id = target_user_id 
          AND upsp.season = target_season 
          AND upsp.week = target_week
    )
    SELECT 
        JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'type', dd.data_type,
                'count', dd.count,
                'details', dd.details
            )
        ) as debug_info
    FROM debug_data dd;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.debug_user_pick_sets(UUID, INTEGER, INTEGER) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 119 COMPLETED - Fixed comparison view!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 FIXES:';
    RAISE NOTICE '• Comparison function now shows ALL pick sets regardless of leaderboard status';
    RAISE NOTICE '• Both authenticated and anonymous picks will appear in comparison';
    RAISE NOTICE '• Added debug function to troubleshoot missing pick sets';
    RAISE NOTICE '• Ordered pick sets: authenticated first, then anonymous by email';
    RAISE NOTICE '';
END;
$$;