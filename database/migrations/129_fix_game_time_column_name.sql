-- Migration 129: Fix game_time column reference to kickoff_time
-- 
-- PURPOSE: Fix the "column g.game_time does not exist" error by updating
-- the get_custom_pick_combination function to use the correct column name.

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 129: Fix game_time -> kickoff_time column reference';
    RAISE NOTICE '================================================================';
END;
$$;

-- Fix the get_custom_pick_combination function to use kickoff_time
CREATE OR REPLACE FUNCTION public.get_custom_pick_combination(
    target_user_id UUID,
    target_season INTEGER,
    target_week INTEGER
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    combination_record RECORD;
    auth_picks JSONB;
    anon_picks JSONB;
BEGIN
    -- Get the combination record
    SELECT * INTO combination_record
    FROM public.user_custom_pick_combinations
    WHERE user_id = target_user_id
      AND season = target_season
      AND week = target_week;
    
    IF NOT FOUND THEN
        RETURN JSONB_BUILD_OBJECT(
            'has_custom_combination', false,
            'message', 'No custom combination found'
        );
    END IF;
    
    -- Get authenticated picks with game details and combination status
    SELECT JSONB_AGG(
        JSONB_BUILD_OBJECT(
            'pick_id', p.id,
            'selected_team', p.selected_team,
            'original_is_lock', p.is_lock,
            'combination_is_lock', COALESCE(p.combination_is_lock, p.is_lock),
            'show_in_combination', p.show_in_combination,
            'points_earned', p.points_earned,
            'result', p.result,
            'game', JSONB_BUILD_OBJECT(
                'id', g.id,
                'home_team', g.home_team,
                'away_team', g.away_team,
                'spread', g.spread,
                'home_score', g.home_score,
                'away_score', g.away_score,
                'status', g.status,
                'game_time', g.kickoff_time  -- Fixed: use kickoff_time
            )
        ) ORDER BY p.show_in_combination DESC, p.combination_is_lock DESC NULLS LAST, g.kickoff_time
    ) INTO auth_picks
    FROM public.picks p
    JOIN public.games g ON p.game_id = g.id
    WHERE p.user_id = target_user_id 
      AND p.season = target_season 
      AND p.week = target_week
      AND p.submitted_at IS NOT NULL;
    
    -- Get anonymous picks with game details and combination status
    SELECT JSONB_AGG(
        JSONB_BUILD_OBJECT(
            'pick_id', ap.id,
            'selected_team', ap.selected_team,
            'original_is_lock', ap.is_lock,
            'combination_is_lock', COALESCE(ap.combination_is_lock, ap.is_lock),
            'show_in_combination', ap.show_in_combination,
            'points_earned', COALESCE(ap.points_earned, 0),
            'result', 'pending',
            'source_email', ap.email,
            'game', JSONB_BUILD_OBJECT(
                'id', g.id,
                'home_team', g.home_team,
                'away_team', g.away_team,
                'spread', g.spread,
                'home_score', g.home_score,
                'away_score', g.away_score,
                'status', g.status,
                'game_time', g.kickoff_time  -- Fixed: use kickoff_time
            )
        ) ORDER BY ap.show_in_combination DESC, ap.combination_is_lock DESC NULLS LAST, g.kickoff_time
    ) INTO anon_picks
    FROM public.anonymous_picks ap
    JOIN public.games g ON ap.game_id = g.id
    WHERE ap.assigned_user_id = target_user_id 
      AND ap.season = target_season 
      AND ap.week = target_week
      AND ap.show_on_leaderboard = true
      AND ap.validation_status IN ('auto_validated', 'manually_validated');
    
    RETURN JSONB_BUILD_OBJECT(
        'has_custom_combination', true,
        'combination_info', ROW_TO_JSON(combination_record),
        'authenticated_picks', COALESCE(auth_picks, '[]'::jsonb),
        'anonymous_picks', COALESCE(anon_picks, '[]'::jsonb)
    );
END;
$$;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 129 COMPLETED - Fixed game_time column reference!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 FIXES APPLIED:';
    RAISE NOTICE '• Changed g.game_time to g.kickoff_time in function';
    RAISE NOTICE '• Updated ORDER BY clause to use kickoff_time';
    RAISE NOTICE '• Fixed game object to use kickoff_time';
    RAISE NOTICE '';
    RAISE NOTICE '💾 Custom pick combination saves should now work!';
END;
$$;