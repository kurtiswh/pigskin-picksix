-- Migration 115e: Create Leaderboard Refresh Function
-- Simple function to refresh leaderboard tables

CREATE OR REPLACE FUNCTION scheduled_leaderboard_refresh()
RETURNS TABLE(
    season_entries INTEGER,
    weekly_entries INTEGER,
    errors TEXT[]
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    season_count INTEGER := 0;
    weekly_count INTEGER := 0;
    error_list TEXT[] := ARRAY[]::TEXT[];
    current_season INTEGER := 2024; -- Current season
    active_week_rec RECORD;
BEGIN
    RAISE NOTICE '🏆 SCHEDULED LEADERBOARD REFRESH: Starting at %', CURRENT_TIMESTAMP;
    
    -- Step 1: Find active week
    SELECT week, season INTO active_week_rec
    FROM week_settings
    WHERE picks_open = true
    ORDER BY week DESC
    LIMIT 1;
    
    IF NOT FOUND THEN
        RAISE NOTICE '⏳ No active week found, using defaults';
        current_season := 2024;
    ELSE
        current_season := active_week_rec.season;
        RAISE NOTICE '🎯 Refreshing leaderboards for Season % (Active Week: %)', 
                     current_season, active_week_rec.week;
    END IF;
    
    -- Step 2: Try to refresh season leaderboard
    BEGIN
        -- Check if season_leaderboard table exists and has refresh function
        IF EXISTS (SELECT 1 FROM information_schema.routines 
                  WHERE routine_name = 'refresh_season_leaderboard_sources') THEN
            
            RAISE NOTICE '  📈 Refreshing season leaderboard...';
            PERFORM refresh_season_leaderboard_sources();
            
            -- Count entries to verify success
            SELECT COUNT(*) INTO season_count
            FROM season_leaderboard
            WHERE season = current_season;
            
            RAISE NOTICE '  ✅ Season leaderboard: % entries', season_count;
        ELSE
            RAISE NOTICE '  ⏭️ Season leaderboard refresh function not available';
            error_list := array_append(error_list, 'Season leaderboard function not found');
        END IF;
        
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING '  ⚠️ Season leaderboard refresh failed: %', SQLERRM;
            error_list := array_append(error_list, 'Season leaderboard: ' || SQLERRM);
    END;
    
    -- Step 3: Try to refresh weekly leaderboard
    BEGIN
        -- Check if weekly leaderboard refresh function exists
        IF EXISTS (SELECT 1 FROM information_schema.routines 
                  WHERE routine_name = 'refresh_all_weekly_leaderboard_sources') THEN
            
            RAISE NOTICE '  📊 Refreshing weekly leaderboards...';
            PERFORM refresh_all_weekly_leaderboard_sources(current_season);
            
            -- Count entries to verify success (for current active week if available)
            IF active_week_rec.week IS NOT NULL THEN
                SELECT COUNT(*) INTO weekly_count
                FROM weekly_leaderboard
                WHERE season = current_season AND week = active_week_rec.week;
            ELSE
                -- Count total weekly entries for the season
                SELECT COUNT(*) INTO weekly_count
                FROM weekly_leaderboard
                WHERE season = current_season;
            END IF;
            
            RAISE NOTICE '  ✅ Weekly leaderboard: % entries', weekly_count;
        ELSE
            RAISE NOTICE '  ⏭️ Weekly leaderboard refresh function not available';
            error_list := array_append(error_list, 'Weekly leaderboard function not found');
        END IF;
        
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING '  ⚠️ Weekly leaderboard refresh failed: %', SQLERRM;
            error_list := array_append(error_list, 'Weekly leaderboard: ' || SQLERRM);
    END;
    
    -- Step 4: Alternative simple refresh if advanced functions don't exist
    IF season_count = 0 AND weekly_count = 0 THEN
        RAISE NOTICE '  🔄 Attempting simple leaderboard calculation...';
        
        -- Simple season leaderboard update (basic version)
        BEGIN
            -- This is a placeholder for a simple leaderboard calculation
            -- In the real implementation, this would calculate user totals
            -- from picks and update season_leaderboard table
            
            RAISE NOTICE '    💡 Simple leaderboard calculation would go here';
            -- TODO: Implement basic leaderboard calculation
            
        EXCEPTION
            WHEN OTHERS THEN
                error_list := array_append(error_list, 'Simple leaderboard: ' || SQLERRM);
        END;
    END IF;
    
    RAISE NOTICE '📊 Results: % season entries, % weekly entries', 
                 season_count, weekly_count;
    
    RETURN QUERY SELECT season_count, weekly_count, error_list;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Leaderboard refresh failed: %', SQLERRM;
        RETURN QUERY SELECT season_count, weekly_count, 
                           ARRAY[SQLERRM]::TEXT[];
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION scheduled_leaderboard_refresh() TO authenticated;

-- Test the function
DO $$
DECLARE
    test_result RECORD;
BEGIN
    RAISE NOTICE '🧪 Testing scheduled_leaderboard_refresh()...';
    
    SELECT * INTO test_result FROM scheduled_leaderboard_refresh();
    
    RAISE NOTICE '✅ Test completed - Season: %, Weekly: %', 
                 test_result.season_entries, test_result.weekly_entries;
                 
    IF array_length(test_result.errors, 1) > 0 THEN
        RAISE NOTICE '⚠️ Errors: %', test_result.errors;
    END IF;
END;
$$;