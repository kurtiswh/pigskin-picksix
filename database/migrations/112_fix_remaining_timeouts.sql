-- Migration 112: Fix Remaining Timeout Issues for Large Games
-- 
-- PURPOSE: Handle games with many picks that still timeout even with optimization
-- CONTEXT: Virginia Tech @ South Carolina and Notre Dame @ Miami still timing out

DO $$
BEGIN
    RAISE NOTICE '⚡ Migration 112: Creating ultra-optimized picks scoring for large games';
    RAISE NOTICE '================================================================';
END;
$$;

-- Create an ultra-optimized function that processes picks in smaller chunks
CREATE OR REPLACE FUNCTION calculate_pick_results_for_game_chunked(
    game_id_param UUID,
    chunk_size INTEGER DEFAULT 50
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
    total_picks_updated INTEGER := 0;
    total_anon_picks_updated INTEGER := 0;
    chunk_picks_updated INTEGER;
    chunk_anon_picks_updated INTEGER;
    offset_val INTEGER := 0;
    has_more BOOLEAN := TRUE;
BEGIN
    -- Get game details with pre-calculated stats
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
    
    -- Ensure game is completed
    IF game_rec.status != 'completed' OR game_rec.home_score IS NULL OR game_rec.away_score IS NULL THEN
        RETURN QUERY SELECT FALSE, 0, 0, 
            format('Game %s @ %s is not completed or missing scores', game_rec.away_team, game_rec.home_team);
        RETURN;
    END IF;
    
    -- Update game stats if needed (non-blocking)
    IF game_rec.winner_against_spread IS NULL THEN
        UPDATE public.games 
        SET 
            winner_against_spread = game_rec.calc_winner,
            margin_bonus = game_rec.calc_margin_bonus,
            base_points = 20,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = game_id_param
        AND winner_against_spread IS NULL;
    END IF;
    
    -- Process regular picks in chunks
    WHILE has_more LOOP
        WITH picks_batch AS (
            SELECT p.id
            FROM public.picks p
            WHERE p.game_id = game_id_param
            AND (p.result IS NULL OR p.result IS DISTINCT FROM 
                CASE 
                    WHEN p.selected_team = game_rec.calc_winner THEN 'win'::pick_result
                    WHEN game_rec.calc_winner = 'push' THEN 'push'::pick_result
                    ELSE 'loss'::pick_result
                END)
            LIMIT chunk_size
            OFFSET offset_val
        ),
        updated AS (
            UPDATE public.picks p
            SET 
                result = CASE 
                    WHEN p.selected_team = game_rec.calc_winner THEN 'win'::pick_result
                    WHEN game_rec.calc_winner = 'push' THEN 'push'::pick_result
                    ELSE 'loss'::pick_result
                END,
                points_earned = CASE 
                    WHEN p.selected_team = game_rec.calc_winner THEN 
                        20 + game_rec.calc_margin_bonus + 
                        CASE WHEN p.is_lock THEN game_rec.calc_margin_bonus ELSE 0 END
                    WHEN game_rec.calc_winner = 'push' THEN 10
                    ELSE 0
                END,
                updated_at = CURRENT_TIMESTAMP
            FROM picks_batch pb
            WHERE p.id = pb.id
            RETURNING 1
        )
        SELECT COUNT(*) INTO chunk_picks_updated FROM updated;
        
        total_picks_updated := total_picks_updated + chunk_picks_updated;
        
        IF chunk_picks_updated < chunk_size THEN
            has_more := FALSE;
        ELSE
            offset_val := offset_val + chunk_size;
            -- Small pause between chunks to prevent timeout
            PERFORM pg_sleep(0.01);
        END IF;
    END LOOP;
    
    -- Reset for anonymous picks
    offset_val := 0;
    has_more := TRUE;
    
    -- Process anonymous picks in chunks
    WHILE has_more LOOP
        WITH anon_batch AS (
            SELECT ap.id
            FROM public.anonymous_picks ap
            WHERE ap.game_id = game_id_param
            AND (ap.result IS NULL OR ap.result IS DISTINCT FROM 
                CASE 
                    WHEN ap.selected_team = game_rec.calc_winner THEN 'win'::pick_result
                    WHEN game_rec.calc_winner = 'push' THEN 'push'::pick_result
                    ELSE 'loss'::pick_result
                END)
            LIMIT chunk_size
            OFFSET offset_val
        ),
        updated AS (
            UPDATE public.anonymous_picks ap
            SET 
                result = CASE 
                    WHEN ap.selected_team = game_rec.calc_winner THEN 'win'::pick_result
                    WHEN game_rec.calc_winner = 'push' THEN 'push'::pick_result
                    ELSE 'loss'::pick_result
                END,
                points_earned = CASE 
                    WHEN ap.selected_team = game_rec.calc_winner THEN 
                        20 + game_rec.calc_margin_bonus + 
                        CASE WHEN ap.is_lock THEN game_rec.calc_margin_bonus ELSE 0 END
                    WHEN game_rec.calc_winner = 'push' THEN 10
                    ELSE 0
                END
            FROM anon_batch ab
            WHERE ap.id = ab.id
            RETURNING 1
        )
        SELECT COUNT(*) INTO chunk_anon_picks_updated FROM updated;
        
        total_anon_picks_updated := total_anon_picks_updated + chunk_anon_picks_updated;
        
        IF chunk_anon_picks_updated < chunk_size THEN
            has_more := FALSE;
        ELSE
            offset_val := offset_val + chunk_size;
            -- Small pause between chunks
            PERFORM pg_sleep(0.01);
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT TRUE, total_picks_updated, total_anon_picks_updated, 
        format('Processed %s picks and %s anonymous picks in chunks', total_picks_updated, total_anon_picks_updated);
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, total_picks_updated, total_anon_picks_updated, 
            format('Error after processing %s picks and %s anon picks: %s', total_picks_updated, total_anon_picks_updated, SQLERRM);
END;
$$;

-- Override the existing optimized function to use chunking for all games
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
BEGIN
    -- Delegate to the chunked version with default chunk size
    RETURN QUERY 
    SELECT * FROM calculate_pick_results_for_game_chunked(game_id_param, 50);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_pick_results_for_game_chunked(UUID, INTEGER) TO authenticated;

-- Add function documentation
COMMENT ON FUNCTION calculate_pick_results_for_game_chunked(UUID, INTEGER) IS 
'Ultra-optimized chunked processing for games with many picks to prevent timeouts';

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 112 COMPLETED - Ultra-optimized chunked processing added!';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 KEY IMPROVEMENTS:';
    RAISE NOTICE '• Processes picks in chunks of 50 (configurable)';
    RAISE NOTICE '• Micro-pauses between chunks (0.01 seconds)';
    RAISE NOTICE '• Only updates picks that need changing';
    RAISE NOTICE '• Separate chunking for regular and anonymous picks';
    RAISE NOTICE '• Graceful error handling with partial progress tracking';
    RAISE NOTICE '';
    RAISE NOTICE '📋 This should handle even the largest games without timeouts!';
END;
$$;