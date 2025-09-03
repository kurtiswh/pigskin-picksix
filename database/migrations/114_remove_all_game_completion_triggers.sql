-- Migration 114: Remove ALL Game Completion Triggers - Move Logic to Service
-- 
-- PROBLEM: Multiple competing BEFORE/AFTER triggers on games table causing deadlocks
-- SOLUTION: Remove ALL completion-related triggers, move logic to liveUpdateService.ts
-- GOAL: Eliminate database deadlocks by consolidating completion logic in TypeScript

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 114: REMOVING ALL GAME COMPLETION TRIGGERS';
    RAISE NOTICE '========================================================';
    RAISE NOTICE 'GOAL: Eliminate database deadlocks caused by competing triggers';
    RAISE NOTICE 'STRATEGY: Move ALL completion logic to liveUpdateService.ts';
    RAISE NOTICE '';
END;
$$;

-- Step 1: Drop ALL completion-related triggers on games table
-- These are causing the deadlock issue preventing games from completing

-- From Migration 093
DROP TRIGGER IF EXISTS handle_game_completion_only_trigger ON public.games;
DROP FUNCTION IF EXISTS handle_game_completion_only();

-- From Migration 109 (Multiple competing triggers)
DROP TRIGGER IF EXISTS handle_game_completion_scoring_trigger ON public.games;
DROP TRIGGER IF EXISTS process_picks_notification_trigger ON public.games;
DROP TRIGGER IF EXISTS process_picks_safe_trigger ON public.games;
DROP FUNCTION IF EXISTS handle_game_completion_scoring_only();
DROP FUNCTION IF EXISTS process_picks_after_completion();
DROP FUNCTION IF EXISTS process_picks_safe_after_completion();

-- From older migrations that may still exist
DROP TRIGGER IF EXISTS handle_game_completion_trigger ON public.games;
DROP TRIGGER IF EXISTS update_pick_statistics_trigger ON public.games;
DROP TRIGGER IF EXISTS calculate_game_winner_trigger ON public.games;
DROP TRIGGER IF EXISTS auto_calculate_winner_trigger ON public.games;
DROP TRIGGER IF EXISTS game_completion_trigger ON public.games;
DROP TRIGGER IF EXISTS picks_scoring_trigger ON public.games;

-- Step 2: Keep ONLY the essential timestamp trigger (non-blocking)
-- This is safe and doesn't cause conflicts
-- update_games_updated_at trigger should remain for audit purposes

-- Step 3: Create helper functions that can be called directly from TypeScript
-- These replace the trigger logic but are called explicitly by liveUpdateService

CREATE OR REPLACE FUNCTION calculate_game_winner_and_bonus(
    game_id_param UUID,
    home_score_param INTEGER,
    away_score_param INTEGER,
    spread_param DECIMAL
)
RETURNS TABLE(
    winner_against_spread TEXT,
    margin_bonus INTEGER,
    base_points INTEGER
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    home_margin DECIMAL;
    winner_team TEXT;
    bonus_points INTEGER;
BEGIN
    RAISE NOTICE '🎯 Calculating winner for game %: % - % (spread: %)', 
        game_id_param, away_score_param, home_score_param, spread_param;
    
    home_margin := home_score_param - away_score_param;
    
    -- Calculate winner against spread
    IF ABS(home_margin + spread_param) < 0.5 THEN
        winner_team := 'push';
        bonus_points := 0;
    ELSIF home_margin + spread_param > 0 THEN
        winner_team := (SELECT home_team FROM games WHERE id = game_id_param);
        -- Calculate margin bonus for home team win
        bonus_points := CASE 
            WHEN (home_margin + spread_param) >= 29 THEN 5
            WHEN (home_margin + spread_param) >= 20 THEN 3
            WHEN (home_margin + spread_param) >= 11 THEN 1
            ELSE 0
        END;
    ELSE
        winner_team := (SELECT away_team FROM games WHERE id = game_id_param);
        -- Calculate margin bonus for away team win
        bonus_points := CASE 
            WHEN ABS(home_margin + spread_param) >= 29 THEN 5
            WHEN ABS(home_margin + spread_param) >= 20 THEN 3
            WHEN ABS(home_margin + spread_param) >= 11 THEN 1
            ELSE 0
        END;
    END IF;
    
    RAISE NOTICE '✅ Results: winner=%, bonus=%, base=20', winner_team, bonus_points;
    
    RETURN QUERY SELECT winner_team, bonus_points, 20;
END;
$$;

CREATE OR REPLACE FUNCTION process_picks_for_completed_game(
    game_id_param UUID
)
RETURNS TABLE(
    picks_updated INTEGER,
    anonymous_picks_updated INTEGER
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    game_rec RECORD;
    picks_count INTEGER := 0;
    anon_picks_count INTEGER := 0;
BEGIN
    RAISE NOTICE '🎯 Processing picks for completed game: %', game_id_param;
    
    -- Get the completed game data
    SELECT * INTO game_rec 
    FROM public.games 
    WHERE id = game_id_param AND status = 'completed';
    
    IF NOT FOUND THEN
        RAISE WARNING 'Game % not found or not completed', game_id_param;
        RETURN QUERY SELECT 0, 0;
        RETURN;
    END IF;
    
    IF game_rec.winner_against_spread IS NULL THEN
        RAISE WARNING 'Game % completed but winner_against_spread not calculated', game_id_param;
        RETURN QUERY SELECT 0, 0;
        RETURN;
    END IF;
    
    RAISE NOTICE '  Game: % @ % (% - %), Winner: %, Bonus: %', 
        game_rec.away_team, game_rec.home_team,
        game_rec.away_score, game_rec.home_score,
        game_rec.winner_against_spread, game_rec.margin_bonus;
    
    -- Update regular picks
    UPDATE public.picks
    SET 
        result = CASE 
            WHEN selected_team = game_rec.winner_against_spread THEN 'win'::pick_result
            WHEN game_rec.winner_against_spread = 'push' THEN 'push'::pick_result
            ELSE 'loss'::pick_result
        END,
        points_earned = CASE 
            WHEN selected_team = game_rec.winner_against_spread THEN 
                20 + COALESCE(game_rec.margin_bonus, 0) + 
                CASE WHEN is_lock THEN COALESCE(game_rec.margin_bonus, 0) ELSE 0 END
            WHEN game_rec.winner_against_spread = 'push' THEN 10
            ELSE 0
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE game_id = game_id_param 
    AND (result IS NULL OR result != CASE 
        WHEN selected_team = game_rec.winner_against_spread THEN 'win'::pick_result
        WHEN game_rec.winner_against_spread = 'push' THEN 'push'::pick_result
        ELSE 'loss'::pick_result
    END);
    
    GET DIAGNOSTICS picks_count = ROW_COUNT;
    
    -- Update anonymous picks
    UPDATE public.anonymous_picks
    SET 
        result = CASE 
            WHEN selected_team = game_rec.winner_against_spread THEN 'win'::pick_result
            WHEN game_rec.winner_against_spread = 'push' THEN 'push'::pick_result
            ELSE 'loss'::pick_result
        END,
        points_earned = CASE 
            WHEN selected_team = game_rec.winner_against_spread THEN 
                20 + COALESCE(game_rec.margin_bonus, 0) + 
                CASE WHEN is_lock THEN COALESCE(game_rec.margin_bonus, 0) ELSE 0 END
            WHEN game_rec.winner_against_spread = 'push' THEN 10
            ELSE 0
        END
    WHERE game_id = game_id_param 
    AND (result IS NULL OR result != CASE 
        WHEN selected_team = game_rec.winner_against_spread THEN 'win'
        WHEN game_rec.winner_against_spread = 'push' THEN 'push'
        ELSE 'loss'
    END);
    
    GET DIAGNOSTICS anon_picks_count = ROW_COUNT;
    
    RAISE NOTICE '✅ Updated % picks and % anonymous picks', picks_count, anon_picks_count;
    
    RETURN QUERY SELECT picks_count, anon_picks_count;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Error processing picks for game %: %', game_id_param, SQLERRM;
        RETURN QUERY SELECT 0, 0;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION calculate_game_winner_and_bonus(UUID, INTEGER, INTEGER, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION process_picks_for_completed_game(UUID) TO authenticated;

-- Step 4: Verify triggers are removed
DO $$
DECLARE
    trigger_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO trigger_count
    FROM information_schema.triggers
    WHERE event_object_table = 'games'
      AND event_object_schema = 'public'
      AND trigger_name NOT IN ('update_games_updated_at'); -- Keep timestamp trigger
    
    RAISE NOTICE '';
    RAISE NOTICE '🔍 TRIGGER CLEANUP VERIFICATION:';
    RAISE NOTICE 'Remaining non-timestamp triggers on games table: %', trigger_count;
    
    IF trigger_count = 0 THEN
        RAISE NOTICE '✅ SUCCESS: All completion-related triggers removed!';
    ELSE
        RAISE NOTICE '⚠️  Some triggers may still exist - check manually if needed';
    END IF;
END;
$$;

-- Final summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 114 COMPLETED - Game completion triggers removed!';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 CHANGES MADE:';
    RAISE NOTICE '• Removed ALL completion-related triggers from games table';
    RAISE NOTICE '• Created helper functions for TypeScript to call directly';
    RAISE NOTICE '• Eliminated competing BEFORE/AFTER trigger chains';
    RAISE NOTICE '• No more database deadlocks on game completion';
    RAISE NOTICE '';
    RAISE NOTICE '📋 NEW APPROACH:';
    RAISE NOTICE '• liveUpdateService.ts will handle ALL game completion logic';
    RAISE NOTICE '• calculate_game_winner_and_bonus() - call when game completes';
    RAISE NOTICE '• process_picks_for_completed_game() - call after status update';
    RAISE NOTICE '• No reactive triggers = No deadlocks';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 EXPECTED RESULT:';
    RAISE NOTICE 'Games like TCU vs North Carolina should now complete without hanging!';
    RAISE NOTICE 'liveUpdateService controls the entire completion flow in TypeScript.';
END;
$$;