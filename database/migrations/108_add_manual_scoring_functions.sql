-- Migration 108: Add Manual Scoring Functions for Admin Dashboard
-- 
-- PURPOSE: Create database functions to support admin manual scoring operations
-- CONTEXT: Admin dashboard needs manual controls for troubleshooting scoring issues

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 108: Adding manual scoring functions for admin dashboard';
    RAISE NOTICE '=================================================================';
END;
$$;

-- Function 1: Manual picks scoring for a specific week
CREATE OR REPLACE FUNCTION calculate_pick_results_for_week(
    week_param INTEGER,
    season_param INTEGER
)
RETURNS TABLE(
    processed_games INTEGER,
    updated_picks INTEGER,
    operation_status TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    game_rec RECORD;
    total_games INTEGER := 0;
    total_picks INTEGER := 0;
    picks_updated INTEGER;
BEGIN
    RAISE NOTICE '🎯 Starting manual picks scoring for Week % Season %', week_param, season_param;
    
    -- Process each completed game in the specified week
    FOR game_rec IN 
        SELECT * FROM public.games 
        WHERE week = week_param 
        AND season = season_param 
        AND status = 'completed'
        AND home_score IS NOT NULL 
        AND away_score IS NOT NULL
    LOOP
        total_games := total_games + 1;
        
        RAISE NOTICE '  Processing game: % @ % (% - %)', 
            game_rec.away_team, game_rec.home_team, 
            game_rec.away_score, game_rec.home_score;
        
        -- Update picks for this game
        UPDATE public.picks
        SET 
            result = CASE 
                WHEN selected_team = game_rec.winner_against_spread THEN 'win'::pick_result
                WHEN game_rec.winner_against_spread = 'push' THEN 'push'::pick_result
                ELSE 'loss'::pick_result
            END,
            points_earned = CASE 
                WHEN selected_team = game_rec.winner_against_spread THEN 
                    -- Base 20 points + margin bonus + lock bonus
                    20 + COALESCE(game_rec.margin_bonus, 0) + 
                    CASE WHEN is_lock THEN COALESCE(game_rec.margin_bonus, 0) ELSE 0 END
                WHEN game_rec.winner_against_spread = 'push' THEN 10
                ELSE 0
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE game_id = game_rec.id;
        
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
        total_picks := total_picks + picks_updated;
        
        RAISE NOTICE '    Updated % picks for this game', picks_updated;
    END LOOP;
    
    RAISE NOTICE '✅ Manual picks scoring completed: % games processed, % picks updated', 
        total_games, total_picks;
    
    RETURN QUERY SELECT total_games, total_picks, 
        format('Successfully processed %s games and updated %s picks', total_games, total_picks);
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Error in manual picks scoring: %', SQLERRM;
        RETURN QUERY SELECT 0, 0, format('Error: %s', SQLERRM);
END;
$$;

-- Function 2: Manual anonymous picks scoring for a specific week
CREATE OR REPLACE FUNCTION calculate_anonymous_picks_for_week(
    week_param INTEGER,
    season_param INTEGER
)
RETURNS TABLE(
    processed_games INTEGER,
    updated_picks INTEGER,
    operation_status TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    game_rec RECORD;
    total_games INTEGER := 0;
    total_picks INTEGER := 0;
    picks_updated INTEGER;
BEGIN
    RAISE NOTICE '🎭 Starting manual anonymous picks scoring for Week % Season %', week_param, season_param;
    
    -- Process each completed game in the specified week
    FOR game_rec IN 
        SELECT * FROM public.games 
        WHERE week = week_param 
        AND season = season_param 
        AND status = 'completed'
        AND home_score IS NOT NULL 
        AND away_score IS NOT NULL
    LOOP
        total_games := total_games + 1;
        
        RAISE NOTICE '  Processing anonymous picks for game: % @ %', 
            game_rec.away_team, game_rec.home_team;
        
        -- Update anonymous picks for this game
        UPDATE public.anonymous_picks
        SET 
            result = CASE 
                WHEN selected_team = game_rec.winner_against_spread THEN 'win'
                WHEN game_rec.winner_against_spread = 'push' THEN 'push'
                ELSE 'loss'
            END,
            points_earned = CASE 
                WHEN selected_team = game_rec.winner_against_spread THEN 
                    -- Base 20 points + margin bonus + lock bonus
                    20 + COALESCE(game_rec.margin_bonus, 0) + 
                    CASE WHEN is_lock THEN COALESCE(game_rec.margin_bonus, 0) ELSE 0 END
                WHEN game_rec.winner_against_spread = 'push' THEN 10
                ELSE 0
            END
        WHERE game_id = game_rec.id;
        
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
        total_picks := total_picks + picks_updated;
        
        RAISE NOTICE '    Updated % anonymous picks for this game', picks_updated;
    END LOOP;
    
    RAISE NOTICE '✅ Manual anonymous picks scoring completed: % games processed, % picks updated', 
        total_games, total_picks;
    
    RETURN QUERY SELECT total_games, total_picks, 
        format('Successfully processed %s games and updated %s anonymous picks', total_games, total_picks);
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Error in manual anonymous picks scoring: %', SQLERRM;
        RETURN QUERY SELECT 0, 0, format('Error: %s', SQLERRM);
END;
$$;

-- Function 3: Manual leaderboard recalculation for a specific week/season
CREATE OR REPLACE FUNCTION recalculate_leaderboards_for_week(
    week_param INTEGER,
    season_param INTEGER
)
RETURNS TABLE(
    weekly_entries INTEGER,
    season_entries INTEGER,
    operation_status TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    weekly_count INTEGER := 0;
    season_count INTEGER := 0;
    user_rec RECORD;
BEGIN
    RAISE NOTICE '📊 Starting manual leaderboard recalculation for Week % Season %', week_param, season_param;
    
    -- Recalculate for all users who have picks in this week
    FOR user_rec IN 
        SELECT DISTINCT p.user_id 
        FROM public.picks p 
        WHERE p.week = week_param 
        AND p.season = season_param
    LOOP
        -- Recalculate weekly leaderboard entry
        PERFORM public.recalculate_weekly_leaderboard_for_user(user_rec.user_id, week_param, season_param);
        weekly_count := weekly_count + 1;
        
        -- Recalculate season leaderboard entry
        PERFORM public.recalculate_season_leaderboard_for_user(user_rec.user_id, season_param);
        season_count := season_count + 1;
    END LOOP;
    
    RAISE NOTICE '✅ Manual leaderboard recalculation completed: % weekly entries, % season entries', 
        weekly_count, season_count;
    
    RETURN QUERY SELECT weekly_count, season_count, 
        format('Successfully recalculated %s weekly and %s season leaderboard entries', weekly_count, season_count);
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Error in manual leaderboard recalculation: %', SQLERRM;
        RETURN QUERY SELECT 0, 0, format('Error: %s', SQLERRM);
END;
$$;

-- Function 4: Manual game stats update for completed games
CREATE OR REPLACE FUNCTION calculate_week_game_statistics(
    week_param INTEGER,
    season_param INTEGER
)
RETURNS TABLE(
    processed_games INTEGER,
    calculated_stats INTEGER,
    operation_status TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    game_rec RECORD;
    total_games INTEGER := 0;
    stats_calculated INTEGER := 0;
    home_margin DECIMAL;
    winner_team TEXT;
    margin_bonus_val INTEGER;
BEGIN
    RAISE NOTICE '📈 Starting manual game statistics calculation for Week % Season %', week_param, season_param;
    
    -- Process each game that has scores but might be missing calculated stats
    FOR game_rec IN 
        SELECT * FROM public.games 
        WHERE week = week_param 
        AND season = season_param 
        AND home_score IS NOT NULL 
        AND away_score IS NOT NULL
    LOOP
        total_games := total_games + 1;
        
        -- Calculate winner against spread
        home_margin := game_rec.home_score - game_rec.away_score;
        
        IF ABS(home_margin + game_rec.spread) < 0.5 THEN
            winner_team := 'push';
            margin_bonus_val := 0;
        ELSIF home_margin + game_rec.spread > 0 THEN
            winner_team := game_rec.home_team;
            -- Calculate margin bonus for home team win
            margin_bonus_val := CASE 
                WHEN (home_margin + game_rec.spread) >= 29 THEN 5
                WHEN (home_margin + game_rec.spread) >= 20 THEN 3
                WHEN (home_margin + game_rec.spread) >= 11 THEN 1
                ELSE 0
            END;
        ELSE
            winner_team := game_rec.away_team;
            -- Calculate margin bonus for away team win
            margin_bonus_val := CASE 
                WHEN ABS(home_margin + game_rec.spread) >= 29 THEN 5
                WHEN ABS(home_margin + game_rec.spread) >= 20 THEN 3
                WHEN ABS(home_margin + game_rec.spread) >= 11 THEN 1
                ELSE 0
            END;
        END IF;
        
        -- Update game with calculated stats
        UPDATE public.games 
        SET 
            winner_against_spread = winner_team,
            margin_bonus = margin_bonus_val,
            base_points = 20,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = game_rec.id;
        
        stats_calculated := stats_calculated + 1;
        
        RAISE NOTICE '  Updated stats for % @ %: winner=%, margin_bonus=%', 
            game_rec.away_team, game_rec.home_team, winner_team, margin_bonus_val;
    END LOOP;
    
    RAISE NOTICE '✅ Manual game statistics completed: % games processed, % stats calculated', 
        total_games, stats_calculated;
    
    RETURN QUERY SELECT total_games, stats_calculated, 
        format('Successfully processed %s games and calculated %s game statistics', total_games, stats_calculated);
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Error in manual game statistics calculation: %', SQLERRM;
        RETURN QUERY SELECT 0, 0, format('Error: %s', SQLERRM);
END;
$$;

-- Grant execute permissions to authenticated users (admin check happens in application layer)
GRANT EXECUTE ON FUNCTION calculate_pick_results_for_week(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_anonymous_picks_for_week(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_leaderboards_for_week(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_week_game_statistics(INTEGER, INTEGER) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION calculate_pick_results_for_week(INTEGER, INTEGER) IS 
'Manual admin function to recalculate pick results for all completed games in a specific week';

COMMENT ON FUNCTION calculate_anonymous_picks_for_week(INTEGER, INTEGER) IS 
'Manual admin function to recalculate anonymous pick results for all completed games in a specific week';

COMMENT ON FUNCTION recalculate_leaderboards_for_week(INTEGER, INTEGER) IS 
'Manual admin function to recalculate both weekly and season leaderboards for all users in a specific week';

COMMENT ON FUNCTION calculate_week_game_statistics(INTEGER, INTEGER) IS 
'Manual admin function to recalculate game statistics (winner ATS, margin bonus) for all games with scores in a specific week';

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 108 COMPLETED - Manual scoring functions created!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 CREATED FUNCTIONS:';
    RAISE NOTICE '• calculate_pick_results_for_week(week, season) - Manual picks scoring';
    RAISE NOTICE '• calculate_anonymous_picks_for_week(week, season) - Manual anonymous picks scoring';
    RAISE NOTICE '• recalculate_leaderboards_for_week(week, season) - Manual leaderboard recalculation';
    RAISE NOTICE '• calculate_week_game_statistics(week, season) - Manual game stats calculation';
    RAISE NOTICE '';
    RAISE NOTICE '🛠️ These functions support the admin dashboard manual scoring operations.';
    RAISE NOTICE 'All functions return structured results for UI feedback.';
END;
$$;