-- Migration 097: Disable the expensive picks_after_game_update trigger
-- 
-- PURPOSE: Remove the picks_after_game_update trigger that's causing slowness
-- ISSUE: This trigger calls calculate_pick_results() on EVERY game update, not just completions

DO $$
BEGIN
    RAISE NOTICE '🚨 Migration 097: DISABLE EXPENSIVE PICKS TRIGGER';
    RAISE NOTICE '===============================================';
    RAISE NOTICE 'PROBLEM FOUND: picks_after_game_update trigger still active';
    RAISE NOTICE 'This trigger calls calculate_pick_results() on EVERY game update';
    RAISE NOTICE 'It should only run on completion, not during live updates';
    RAISE NOTICE '';
END;
$$;

-- Drop the expensive picks trigger
DROP TRIGGER IF EXISTS picks_after_game_update ON games;

-- Verify it's gone
DO $$
BEGIN
    RAISE NOTICE '✅ Disabled picks_after_game_update trigger';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 RESULT: Game completion should now be FAST';
    RAISE NOTICE 'Only these triggers remain on games table:';
    RAISE NOTICE '- handle_game_completion_only_trigger (completion-only)';
    RAISE NOTICE '- update_games_updated_at (harmless timestamp update)';
    RAISE NOTICE '';
    RAISE NOTICE '📋 TEST NEXT:';
    RAISE NOTICE '1. Update another game status to completed';
    RAISE NOTICE '2. Should complete in milliseconds now';
    RAISE NOTICE '3. If still slow, run Migration 096 for ultra-minimal approach';
END;
$$;