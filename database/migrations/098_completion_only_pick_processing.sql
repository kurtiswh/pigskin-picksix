-- Migration 098: Completion-only pick processing
-- 
-- PURPOSE: Replace expensive picks_after_game_update with completion-only pick processing
-- ISSUE: Current picks trigger fires on ALL updates, should only fire on completion

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 098: COMPLETION-ONLY PICK PROCESSING';
    RAISE NOTICE '=============================================';
    RAISE NOTICE 'SOLUTION: Replace expensive trigger with completion-only version';
    RAISE NOTICE '';
END;
$$;

-- Step 1: Remove expensive trigger that fires on all updates
DROP TRIGGER IF EXISTS picks_after_game_update ON games;

-- Step 2: Create completion-only pick processing function
CREATE OR REPLACE FUNCTION process_picks_on_completion()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    -- Only process picks when game status changes to completed
    IF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' THEN
        
        -- Call the existing pick calculation function, but only on completion
        PERFORM calculate_pick_results(NEW.id);
        
        RAISE NOTICE 'Processed picks for completed game: % @ %', NEW.away_team, NEW.home_team;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Step 3: Create completion-only pick processing trigger
CREATE TRIGGER process_picks_on_completion_trigger
    AFTER UPDATE ON public.games
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed')
    EXECUTE FUNCTION process_picks_on_completion();

-- Add helpful diagnostics
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Created completion-only pick processing trigger!';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 WHAT THIS DOES:';
    RAISE NOTICE '- Only processes picks when status changes to "completed"';
    RAISE NOTICE '- No pick processing during live score/clock updates';
    RAISE NOTICE '- Maintains all existing pick calculation logic';
    RAISE NOTICE '- Should eliminate timeout issues';
    RAISE NOTICE '';
    RAISE NOTICE '📋 TRIGGERS NOW ACTIVE ON GAMES TABLE:';
    RAISE NOTICE '1. handle_game_completion_only_trigger - Game scoring only';
    RAISE NOTICE '2. process_picks_on_completion_trigger - Pick processing only';
    RAISE NOTICE '3. update_games_updated_at - Timestamp updates';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 EXPECTED RESULT:';
    RAISE NOTICE '✅ Fast game completion (no timeout)';
    RAISE NOTICE '✅ Pick processing works when games complete';
    RAISE NOTICE '✅ Leaderboards update correctly';
    RAISE NOTICE '✅ Live updates work without performance issues';
END;
$$;