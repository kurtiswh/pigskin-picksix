-- Migration 118: Clean up incorrect winner_against_spread data
-- Clear winner data for non-completed games

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🧹 CLEANING UP INCORRECT WINNER DATA...';
    RAISE NOTICE '====================================';
    RAISE NOTICE '';
    
    -- Clear winner_against_spread and margin_bonus for non-completed games
    UPDATE games 
    SET winner_against_spread = NULL,
        margin_bonus = NULL,
        base_points = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE status != 'completed' 
    AND (winner_against_spread IS NOT NULL OR margin_bonus IS NOT NULL OR base_points IS NOT NULL);
    
    -- Report what was cleaned up
    RAISE NOTICE '✅ Cleaned up winner data for % non-completed games', FOUND;
    RAISE NOTICE '';
    RAISE NOTICE '🎯 VERIFICATION: Remaining games with winner data should only be completed games';
    
    -- Show current status
    RAISE NOTICE '';
    RAISE NOTICE '📊 CURRENT GAME STATUS SUMMARY:';
    
    -- This will show the counts but won't return data to user
    PERFORM (
        SELECT 
            COUNT(*) FILTER (WHERE status = 'completed' AND winner_against_spread IS NOT NULL) as completed_with_winner,
            COUNT(*) FILTER (WHERE status != 'completed' AND winner_against_spread IS NOT NULL) as non_completed_with_winner,
            COUNT(*) FILTER (WHERE status = 'completed' AND winner_against_spread IS NULL) as completed_without_winner
        FROM games
        WHERE season = 2025 AND week IN (SELECT week FROM week_settings WHERE picks_open = true)
    );
    
    RAISE NOTICE '✅ CLEANUP COMPLETE!';
    RAISE NOTICE '';
END;
$$;