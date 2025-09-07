-- Migration 115b: Create Live Game Updates Function
-- Simple time-based function to update game scores and completion

CREATE OR REPLACE FUNCTION scheduled_live_game_updates()
RETURNS TABLE(
    games_checked INTEGER,
    games_updated INTEGER,
    newly_completed INTEGER,
    errors TEXT[]
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    checked_count INTEGER := 0;
    updated_count INTEGER := 0;
    completed_count INTEGER := 0;
    error_list TEXT[] := ARRAY[]::TEXT[];
    active_week_rec RECORD;
    game_rec RECORD;
BEGIN
    RAISE NOTICE '🏈 SCHEDULED LIVE UPDATES: Starting at %', CURRENT_TIMESTAMP;
    
    -- Step 1: Find active week
    SELECT week, season INTO active_week_rec
    FROM week_settings
    WHERE picks_open = true
    ORDER BY week DESC
    LIMIT 1;
    
    IF NOT FOUND THEN
        RAISE NOTICE '⏳ No active week found for live updates';
        RETURN QUERY SELECT 0, 0, 0, ARRAY['No active week found']::TEXT[];
        RETURN;
    END IF;
    
    RAISE NOTICE '🎯 Processing Week % Season %', active_week_rec.week, active_week_rec.season;
    
    -- Step 2: Process non-completed games
    FOR game_rec IN 
        SELECT id, home_team, away_team, home_score, away_score, status, spread
        FROM games 
        WHERE season = active_week_rec.season 
        AND week = active_week_rec.week
        AND status != 'completed'
    LOOP
        checked_count := checked_count + 1;
        
        -- TODO: Here we would fetch from CFBD API
        -- For now, this is a placeholder that will be implemented
        -- in the next phase when we integrate with the CFBD service
        
        RAISE NOTICE '  📊 Checking: % @ %', game_rec.away_team, game_rec.home_team;
        
        -- Example of what the API integration will do:
        -- 1. Fetch game data from CFBD
        -- 2. Check if status changed
        -- 3. Update scores if different
        -- 4. If newly completed, calculate winner_against_spread
        
    END LOOP;
    
    RAISE NOTICE '📊 Results: % checked, % updated, % newly completed', 
                 checked_count, updated_count, completed_count;
    
    RETURN QUERY SELECT checked_count, updated_count, completed_count, error_list;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Live updates failed: %', SQLERRM;
        RETURN QUERY SELECT checked_count, updated_count, completed_count, 
                           ARRAY[SQLERRM]::TEXT[];
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION scheduled_live_game_updates() TO authenticated;

-- Test the function
DO $$
DECLARE
    test_result RECORD;
BEGIN
    RAISE NOTICE '🧪 Testing scheduled_live_game_updates()...';
    
    SELECT * INTO test_result FROM scheduled_live_game_updates();
    
    RAISE NOTICE '✅ Test completed - Games checked: %, Updated: %, Completed: %', 
                 test_result.games_checked, test_result.games_updated, test_result.newly_completed;
                 
    IF array_length(test_result.errors, 1) > 0 THEN
        RAISE NOTICE '⚠️ Errors: %', test_result.errors;
    END IF;
END;
$$;