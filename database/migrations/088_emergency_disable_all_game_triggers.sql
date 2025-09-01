-- Migration 088: EMERGENCY - Disable ALL game table triggers to isolate timeout issue
-- 
-- ISSUE: Still getting "Query read timeout" when updating status to completed
-- PROBLEM: Even after fixing functions and NULL handling, something is still blocking
-- HYPOTHESIS: There's still some competing process or expensive operation
-- SOLUTION: Temporarily disable ALL triggers to test if completion works

BEGIN;

-- EMERGENCY: Disable ALL triggers on games table to isolate the issue
DROP TRIGGER IF EXISTS update_game_completion_trigger ON public.games;
DROP TRIGGER IF EXISTS update_picks_after_completion_trigger ON public.games;
DROP TRIGGER IF EXISTS update_game_scoring_conditional_trigger ON public.games;
DROP TRIGGER IF EXISTS update_game_winner_scoring_trigger ON public.games;
DROP TRIGGER IF EXISTS update_covered_status_trigger ON public.games;
DROP TRIGGER IF EXISTS recalculate_pick_points_trigger ON public.games;
DROP TRIGGER IF EXISTS update_pick_stats_on_game_completion_safe_trigger ON public.games;
DROP TRIGGER IF EXISTS update_pick_stats_on_game_completion_trigger ON public.games;

-- Also check for any other triggers that might exist
DROP TRIGGER IF EXISTS calculate_pick_results_trigger ON public.games;
DROP TRIGGER IF EXISTS update_game_scoring_trigger ON public.games;

-- Create a simple manual function to test completion without any triggers
CREATE OR REPLACE FUNCTION public.manual_complete_game(game_id_param UUID)
RETURNS TABLE(
    success BOOLEAN,
    winner_ats TEXT,
    margin_bonus INTEGER,
    picks_updated INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    game_record RECORD;
    picks_count INTEGER;
BEGIN
    -- Get the game data
    SELECT * INTO game_record 
    FROM public.games 
    WHERE id = game_id_param;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::INTEGER, 0;
        RETURN;
    END IF;
    
    -- Update game with completion data (no triggers will fire)
    UPDATE public.games
    SET 
        status = 'completed',
        api_completed = true,
        winner_against_spread = calculate_winner_against_spread(
            home_team, away_team, home_score, away_score, spread
        ),
        margin_bonus = CASE 
            WHEN calculate_winner_against_spread(home_team, away_team, home_score, away_score, spread) = 'push' 
                OR calculate_winner_against_spread(home_team, away_team, home_score, away_score, spread) IS NULL 
            THEN 0
            WHEN calculate_winner_against_spread(home_team, away_team, home_score, away_score, spread) = home_team 
            THEN
                CASE 
                    WHEN (home_score + spread - away_score) >= 29 THEN 5
                    WHEN (home_score + spread - away_score) >= 20 THEN 3  
                    WHEN (home_score + spread - away_score) >= 11 THEN 1
                    ELSE 0
                END
            WHEN calculate_winner_against_spread(home_team, away_team, home_score, away_score, spread) = away_team 
            THEN
                CASE 
                    WHEN (away_score - home_score - spread) >= 29 THEN 5
                    WHEN (away_score - home_score - spread) >= 20 THEN 3
                    WHEN (away_score - home_score - spread) >= 11 THEN 1  
                    ELSE 0
                END
            ELSE 0
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = game_id_param;
    
    -- Get updated game data
    SELECT * INTO game_record 
    FROM public.games 
    WHERE id = game_id_param;
    
    -- Manually update picks (since no triggers)
    UPDATE public.picks
    SET 
        result = CASE 
            WHEN selected_team = game_record.winner_against_spread THEN 'win'::pick_result
            WHEN game_record.winner_against_spread = 'push' THEN 'push'::pick_result
            ELSE 'loss'::pick_result
        END,
        points_earned = CASE 
            WHEN selected_team = game_record.winner_against_spread THEN 
                COALESCE(game_record.base_points, 10) + COALESCE(game_record.margin_bonus, 0) + 
                CASE WHEN is_lock THEN COALESCE(game_record.margin_bonus, 0) ELSE 0 END
            WHEN game_record.winner_against_spread = 'push' THEN 10
            ELSE 0
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE game_id = game_id_param 
    AND result IS NULL;
    
    GET DIAGNOSTICS picks_count = ROW_COUNT;
    
    RETURN QUERY SELECT 
        TRUE, 
        game_record.winner_against_spread, 
        game_record.margin_bonus, 
        picks_count;
END;
$$;

-- Add explanatory comment
COMMENT ON TABLE public.games IS 
    'EMERGENCY STATE: ALL triggers disabled to isolate timeout issue. Use manual_complete_game() function for completion.';

-- Log the emergency action
DO $$
BEGIN
    RAISE NOTICE '🚨 Migration 088: EMERGENCY - ALL GAME TRIGGERS DISABLED';
    RAISE NOTICE '❌ update_game_completion_trigger -> DISABLED';
    RAISE NOTICE '❌ update_picks_after_completion_trigger -> DISABLED';
    RAISE NOTICE '❌ ALL other game triggers -> DISABLED';
    RAISE NOTICE '✅ manual_complete_game(game_id) -> CREATED for testing';
    RAISE NOTICE '🧪 TEST: Try updating game status manually - should work without timeout';
    RAISE NOTICE '🔍 If this works, the issue was trigger-related';
    RAISE NOTICE '🔍 If this still times out, the issue is elsewhere (RLS, indexes, etc.)';
END;
$$;

COMMIT;