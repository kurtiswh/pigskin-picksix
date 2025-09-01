-- Migration 110: Fix Pick Result Type Casting in Anonymous Picks
-- 
-- PURPOSE: Fix data type casting error in calculate_pick_results_for_game function
-- CONTEXT: Migration 109 has inconsistent type casting between picks and anonymous_picks tables

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 110: Fixing pick result type casting errors';
    RAISE NOTICE '================================================================';
END;
$$;

-- Fix the calculate_pick_results_for_game function with proper type casting
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
    
    -- Update regular picks for this game (with proper type casting)
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
    
    -- Update anonymous picks for this game (FIXED: Now with proper type casting)
    UPDATE public.anonymous_picks
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_pick_results_for_game(UUID) TO authenticated;

-- Add updated function documentation
COMMENT ON FUNCTION calculate_pick_results_for_game(UUID) IS 
'Timeout-resistant function to process picks for a single completed game (FIXED: Type casting for pick_result enum)';

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 110 COMPLETED - Pick result type casting fixed!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 FIXED ISSUE:';
    RAISE NOTICE '• Anonymous picks now properly cast result values to pick_result enum type';
    RAISE NOTICE '• Both picks and anonymous_picks tables use consistent ''win''::pick_result syntax';
    RAISE NOTICE '• Should resolve "column result is of type pick_result but expression is of type text" errors';
    RAISE NOTICE '';
    RAISE NOTICE '🛠️ The timeout-resistant picks scoring should now work without data type errors.';
END;
$$;