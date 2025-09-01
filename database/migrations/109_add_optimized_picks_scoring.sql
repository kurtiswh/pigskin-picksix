-- Migration 109: Add Optimized Picks Scoring Functions (Timeout Resistant)
-- 
-- PURPOSE: Create individual game processing functions to avoid timeouts
-- CONTEXT: Migration 108 functions timeout when processing entire weeks with many games

DO $$
BEGIN
    RAISE NOTICE '⚡ Migration 109: Adding timeout-resistant picks scoring functions';
    RAISE NOTICE '================================================================';
END;
$$;

-- Function 1: Process picks for a single game (timeout resistant)
CREATE OR REPLACE FUNCTION calculate_pick_results_for_game(
    game_id_param UUID
)
RETURNS TABLE(
    game_processed BOOLEAN,
    picks_updated INTEGER,
    anonymous_picks_updated INTEGER,
    operation_status TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    game_rec RECORD;
    picks_count INTEGER := 0;
    anon_picks_count INTEGER := 0;
    winner_team TEXT;
    margin_bonus_val INTEGER;
BEGIN
    RAISE NOTICE '🎯 Processing picks for single game: %', game_id_param;
    
    -- Get game details
    SELECT * INTO game_rec FROM public.games WHERE id = game_id_param;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0, 0, 'Game not found';
        RETURN;
    END IF;
    
    -- Ensure game is completed and has scores
    IF game_rec.status != 'completed' OR game_rec.home_score IS NULL OR game_rec.away_score IS NULL THEN
        RETURN QUERY SELECT FALSE, 0, 0, 
            format('Game %s @ %s is not completed or missing scores', game_rec.away_team, game_rec.home_team);
        RETURN;
    END IF;
    
    RAISE NOTICE '  Processing: % @ % (% - %)', 
        game_rec.away_team, game_rec.home_team, 
        game_rec.away_score, game_rec.home_score;
    
    -- Ensure game stats are calculated
    IF game_rec.winner_against_spread IS NULL THEN
        RAISE NOTICE '  Calculating game stats first...';
        PERFORM calculate_game_statistics(game_id_param);
        -- Refresh game record
        SELECT * INTO game_rec FROM public.games WHERE id = game_id_param;
    END IF;
    
    -- Update regular picks for this game
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
    WHERE game_id = game_id_param;
    
    GET DIAGNOSTICS picks_count = ROW_COUNT;
    
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
    WHERE game_id = game_id_param;
    
    GET DIAGNOSTICS anon_picks_count = ROW_COUNT;
    
    RAISE NOTICE '✅ Game processed: % picks updated, % anonymous picks updated', 
        picks_count, anon_picks_count;
    
    RETURN QUERY SELECT TRUE, picks_count, anon_picks_count, 
        format('Successfully processed %s picks and %s anonymous picks', picks_count, anon_picks_count);
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Error processing game %: %', game_id_param, SQLERRM;
        RETURN QUERY SELECT FALSE, 0, 0, format('Error: %s', SQLERRM);
END;
$$;

-- Function 2: Calculate game statistics for a single game
CREATE OR REPLACE FUNCTION calculate_game_statistics(
    game_id_param UUID
)
RETURNS TABLE(
    game_updated BOOLEAN,
    operation_status TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    game_rec RECORD;
    home_margin DECIMAL;
    winner_team TEXT;
    margin_bonus_val INTEGER;
BEGIN
    RAISE NOTICE '📊 Calculating statistics for game: %', game_id_param;
    
    -- Get game details
    SELECT * INTO game_rec FROM public.games WHERE id = game_id_param;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Game not found';
        RETURN;
    END IF;
    
    -- Ensure game has scores
    IF game_rec.home_score IS NULL OR game_rec.away_score IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Game missing scores';
        RETURN;
    END IF;
    
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
    WHERE id = game_id_param;
    
    RAISE NOTICE '  Updated game stats: winner=%, margin_bonus=%', winner_team, margin_bonus_val;
    
    RETURN QUERY SELECT TRUE, 
        format('Game stats calculated: winner=%s, margin_bonus=%s', winner_team, margin_bonus_val);
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Error calculating game statistics for %: %', game_id_param, SQLERRM;
        RETURN QUERY SELECT FALSE, format('Error: %s', SQLERRM);
END;
$$;

-- Function 3: Get list of completed games for batch processing
CREATE OR REPLACE FUNCTION get_completed_games_for_week(
    week_param INTEGER,
    season_param INTEGER
)
RETURNS TABLE(
    game_id UUID,
    away_team TEXT,
    home_team TEXT,
    away_score INTEGER,
    home_score INTEGER,
    has_stats BOOLEAN
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY 
    SELECT 
        g.id,
        g.away_team,
        g.home_team,
        g.away_score,
        g.home_score,
        (g.winner_against_spread IS NOT NULL) as has_stats
    FROM public.games g
    WHERE g.week = week_param 
    AND g.season = season_param 
    AND g.status = 'completed'
    AND g.home_score IS NOT NULL 
    AND g.away_score IS NOT NULL
    ORDER BY g.kickoff_time;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_pick_results_for_game(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_game_statistics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_completed_games_for_week(INTEGER, INTEGER) TO authenticated;

-- Add function documentation
COMMENT ON FUNCTION calculate_pick_results_for_game(UUID) IS 
'Timeout-resistant function to process picks for a single completed game';

COMMENT ON FUNCTION calculate_game_statistics(UUID) IS 
'Calculate winner against spread and margin bonus for a single game';

COMMENT ON FUNCTION get_completed_games_for_week(INTEGER, INTEGER) IS 
'Get list of completed games in a week for batch processing';

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 109 COMPLETED - Timeout-resistant functions created!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 CREATED FUNCTIONS:';
    RAISE NOTICE '• calculate_pick_results_for_game(game_id) - Process picks for single game';
    RAISE NOTICE '• calculate_game_statistics(game_id) - Calculate stats for single game';
    RAISE NOTICE '• get_completed_games_for_week(week, season) - Get games list for processing';
    RAISE NOTICE '';
    RAISE NOTICE '🛠️ These functions support batch processing to avoid timeouts.';
    RAISE NOTICE 'Use get_completed_games_for_week() to get game list, then process each with calculate_pick_results_for_game()';
END;
$$;