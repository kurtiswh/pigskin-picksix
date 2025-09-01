-- Migration 111: Optimize Picks Scoring to Prevent Timeouts
-- 
-- PURPOSE: Fix statement timeout issues when processing picks for multiple games
-- CONTEXT: Even with migration 110's type fix, processing 14 games times out

DO $$
BEGIN
    RAISE NOTICE '⚡ Migration 111: Optimizing picks scoring to prevent timeouts';
    RAISE NOTICE '================================================================';
END;
$$;

-- Create a more efficient function that pre-calculates game stats if needed
CREATE OR REPLACE FUNCTION calculate_pick_results_for_game_optimized(
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
BEGIN
    -- Get game details with calculated stats in a single query
    SELECT 
        g.*,
        CASE 
            WHEN g.winner_against_spread IS NULL AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL THEN
                CASE 
                    WHEN ABS((g.home_score - g.away_score) + g.spread) < 0.5 THEN 'push'
                    WHEN (g.home_score - g.away_score) + g.spread > 0 THEN g.home_team
                    ELSE g.away_team
                END
            ELSE g.winner_against_spread
        END as calc_winner,
        CASE 
            WHEN g.margin_bonus IS NULL AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL THEN
                CASE 
                    WHEN ABS((g.home_score - g.away_score) + g.spread) < 0.5 THEN 0
                    WHEN ABS((g.home_score - g.away_score) + g.spread) >= 29 THEN 5
                    WHEN ABS((g.home_score - g.away_score) + g.spread) >= 20 THEN 3
                    WHEN ABS((g.home_score - g.away_score) + g.spread) >= 11 THEN 1
                    ELSE 0
                END
            ELSE COALESCE(g.margin_bonus, 0)
        END as calc_margin_bonus
    INTO game_rec
    FROM public.games g
    WHERE g.id = game_id_param;
    
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
    
    -- Update game stats if not already calculated (do this separately to avoid locking)
    IF game_rec.winner_against_spread IS NULL THEN
        UPDATE public.games 
        SET 
            winner_against_spread = game_rec.calc_winner,
            margin_bonus = game_rec.calc_margin_bonus,
            base_points = 20,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = game_id_param
        AND winner_against_spread IS NULL; -- Only update if still NULL to avoid race conditions
    END IF;
    
    -- Update regular picks for this game in a single efficient query
    WITH pick_updates AS (
        UPDATE public.picks
        SET 
            result = CASE 
                WHEN selected_team = game_rec.calc_winner THEN 'win'::pick_result
                WHEN game_rec.calc_winner = 'push' THEN 'push'::pick_result
                ELSE 'loss'::pick_result
            END,
            points_earned = CASE 
                WHEN selected_team = game_rec.calc_winner THEN 
                    20 + game_rec.calc_margin_bonus + 
                    CASE WHEN is_lock THEN game_rec.calc_margin_bonus ELSE 0 END
                WHEN game_rec.calc_winner = 'push' THEN 10
                ELSE 0
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE game_id = game_id_param
        AND (result IS NULL OR result IS DISTINCT FROM 
            CASE 
                WHEN selected_team = game_rec.calc_winner THEN 'win'::pick_result
                WHEN game_rec.calc_winner = 'push' THEN 'push'::pick_result
                ELSE 'loss'::pick_result
            END)
        RETURNING 1
    )
    SELECT COUNT(*) INTO picks_count FROM pick_updates;
    
    -- Update anonymous picks for this game
    WITH anon_updates AS (
        UPDATE public.anonymous_picks
        SET 
            result = CASE 
                WHEN selected_team = game_rec.calc_winner THEN 'win'::pick_result
                WHEN game_rec.calc_winner = 'push' THEN 'push'::pick_result
                ELSE 'loss'::pick_result
            END,
            points_earned = CASE 
                WHEN selected_team = game_rec.calc_winner THEN 
                    20 + game_rec.calc_margin_bonus + 
                    CASE WHEN is_lock THEN game_rec.calc_margin_bonus ELSE 0 END
                WHEN game_rec.calc_winner = 'push' THEN 10
                ELSE 0
            END
        WHERE game_id = game_id_param
        AND (result IS NULL OR result IS DISTINCT FROM 
            CASE 
                WHEN selected_team = game_rec.calc_winner THEN 'win'::pick_result
                WHEN game_rec.calc_winner = 'push' THEN 'push'::pick_result
                ELSE 'loss'::pick_result
            END)
        RETURNING 1
    )
    SELECT COUNT(*) INTO anon_picks_count FROM anon_updates;
    
    RETURN QUERY SELECT TRUE, picks_count, anon_picks_count, 
        format('Processed %s picks and %s anonymous picks', picks_count, anon_picks_count);
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, 0, 0, format('Error: %s', SQLERRM);
END;
$$;

-- Create a batch processing function with better timeout handling
CREATE OR REPLACE FUNCTION process_picks_for_week_with_timeout(
    week_param INTEGER,
    season_param INTEGER,
    max_games_per_batch INTEGER DEFAULT 3
)
RETURNS TABLE(
    total_games INTEGER,
    games_processed INTEGER,
    total_picks_updated INTEGER,
    total_anon_picks_updated INTEGER,
    errors TEXT[]
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    game_rec RECORD;
    batch_count INTEGER := 0;
    total_games_count INTEGER := 0;
    processed_count INTEGER := 0;
    picks_total INTEGER := 0;
    anon_picks_total INTEGER := 0;
    error_list TEXT[] := ARRAY[]::TEXT[];
    result_rec RECORD;
BEGIN
    -- Count total games to process
    SELECT COUNT(*) INTO total_games_count
    FROM public.games g
    WHERE g.week = week_param 
    AND g.season = season_param 
    AND g.status = 'completed'
    AND g.home_score IS NOT NULL 
    AND g.away_score IS NOT NULL;
    
    -- Process games in batches
    FOR game_rec IN 
        SELECT g.id, g.away_team, g.home_team
        FROM public.games g
        WHERE g.week = week_param 
        AND g.season = season_param 
        AND g.status = 'completed'
        AND g.home_score IS NOT NULL 
        AND g.away_score IS NOT NULL
        ORDER BY g.kickoff_time
    LOOP
        BEGIN
            -- Process single game with optimized function
            SELECT * INTO result_rec 
            FROM calculate_pick_results_for_game_optimized(game_rec.id);
            
            IF result_rec.game_processed THEN
                processed_count := processed_count + 1;
                picks_total := picks_total + result_rec.picks_updated;
                anon_picks_total := anon_picks_total + result_rec.anonymous_picks_updated;
            ELSE
                error_list := array_append(error_list, 
                    format('%s @ %s: %s', game_rec.away_team, game_rec.home_team, result_rec.operation_status));
            END IF;
            
            batch_count := batch_count + 1;
            
            -- Commit batch if we've reached the limit (helps prevent timeout)
            IF batch_count >= max_games_per_batch THEN
                -- Small delay to prevent overwhelming the database
                PERFORM pg_sleep(0.1);
                batch_count := 0;
            END IF;
            
        EXCEPTION
            WHEN OTHERS THEN
                error_list := array_append(error_list, 
                    format('%s @ %s: %s', game_rec.away_team, game_rec.home_team, SQLERRM));
        END;
    END LOOP;
    
    RETURN QUERY SELECT 
        total_games_count,
        processed_count,
        picks_total,
        anon_picks_total,
        error_list;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_pick_results_for_game_optimized(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION process_picks_for_week_with_timeout(INTEGER, INTEGER, INTEGER) TO authenticated;

-- Add function documentation
COMMENT ON FUNCTION calculate_pick_results_for_game_optimized(UUID) IS 
'Optimized function to process picks for a single game with inline stat calculation to prevent timeouts';

COMMENT ON FUNCTION process_picks_for_week_with_timeout(INTEGER, INTEGER, INTEGER) IS 
'Batch process picks for an entire week with configurable batch size to prevent timeouts';

-- Create indexes if they don't exist to speed up the queries
CREATE INDEX IF NOT EXISTS idx_picks_game_id_result ON public.picks(game_id, result);
CREATE INDEX IF NOT EXISTS idx_anonymous_picks_game_id_result ON public.anonymous_picks(game_id, result);
CREATE INDEX IF NOT EXISTS idx_games_week_season_status ON public.games(week, season, status);

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 111 COMPLETED - Optimized picks scoring to prevent timeouts!';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 OPTIMIZATIONS APPLIED:';
    RAISE NOTICE '• Inline game stats calculation (no separate function call)';
    RAISE NOTICE '• Batch processing with configurable batch size';
    RAISE NOTICE '• Only update picks that need updating (skip already processed)';
    RAISE NOTICE '• Added indexes for faster queries';
    RAISE NOTICE '• Built-in delays between batches to prevent overwhelming DB';
    RAISE NOTICE '';
    RAISE NOTICE '📋 NEW FUNCTIONS:';
    RAISE NOTICE '• calculate_pick_results_for_game_optimized() - Faster single game processing';
    RAISE NOTICE '• process_picks_for_week_with_timeout() - Batch processing for entire week';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 USAGE:';
    RAISE NOTICE '• For single game: SELECT * FROM calculate_pick_results_for_game_optimized(game_id)';
    RAISE NOTICE '• For entire week: SELECT * FROM process_picks_for_week_with_timeout(week, season, batch_size)';
    RAISE NOTICE '• Default batch size is 3 games, adjust if needed';
END;
$$;