-- Simple Fix: Clear pick results for any non-completed games
-- Run this directly in Supabase SQL Editor

DO $$
DECLARE
    games_fixed INTEGER := 0;
    picks_cleared INTEGER := 0;
    anon_picks_cleared INTEGER := 0;
    game_rec RECORD;
BEGIN
    RAISE NOTICE '🔧 CLEARING PICK RESULTS FOR NON-COMPLETED GAMES';
    RAISE NOTICE '=================================================';
    
    -- Process each non-completed game
    FOR game_rec IN 
        SELECT id, home_team, away_team, status 
        FROM games 
        WHERE season = 2025 AND week = 2 AND status != 'completed'
    LOOP
        RAISE NOTICE 'Fixing: % @ % (Status: %)', game_rec.away_team, game_rec.home_team, game_rec.status;
        
        -- Clear regular picks for this game
        UPDATE picks 
        SET result = NULL, points_earned = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE game_id = game_rec.id AND result IS NOT NULL;
        
        GET DIAGNOSTICS picks_cleared = ROW_COUNT;
        
        -- Clear anonymous picks for this game  
        UPDATE anonymous_picks
        SET result = NULL, points_earned = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE game_id = game_rec.id AND result IS NOT NULL;
        
        GET DIAGNOSTICS anon_picks_cleared = ROW_COUNT;
        
        -- Clear game winner data
        UPDATE games 
        SET winner_against_spread = NULL, margin_bonus = NULL, base_points = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = game_rec.id AND winner_against_spread IS NOT NULL;
        
        IF picks_cleared > 0 OR anon_picks_cleared > 0 THEN
            RAISE NOTICE '  ✅ Cleared % picks, % anonymous picks', picks_cleared, anon_picks_cleared;
            games_fixed := games_fixed + 1;
        ELSE
            RAISE NOTICE '  ⏭️ No pick results to clear';
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ FIXED % GAMES', games_fixed;
    RAISE NOTICE 'All non-completed games now have NULL pick results';
END;
$$;