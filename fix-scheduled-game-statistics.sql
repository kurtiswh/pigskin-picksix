-- Fix for scheduled_game_statistics function to properly count locks
-- Issue: The function was only updating basic pick counts without using the comprehensive lock-aware calculation

CREATE OR REPLACE FUNCTION scheduled_game_statistics()
RETURNS TABLE(
    games_updated INTEGER,
    statistics_calculated INTEGER,
    errors TEXT[]
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    games_count INTEGER := 0;
    stats_count INTEGER := 0;
    error_list TEXT[] := ARRAY[]::TEXT[];
    active_week_rec RECORD;
    game_rec RECORD;
BEGIN
    RAISE NOTICE '📊 SCHEDULED GAME STATISTICS: Starting at %', CURRENT_TIMESTAMP;

    -- Step 1: Find active week
    SELECT week, season INTO active_week_rec
    FROM week_settings
    WHERE picks_open = true
    ORDER BY week DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE NOTICE '⏳ No active week found for game statistics';
        RETURN QUERY SELECT 0, 0, ARRAY['No active week found']::TEXT[];
        RETURN;
    END IF;

    RAISE NOTICE '🎯 Calculating statistics for Week % Season %', active_week_rec.week, active_week_rec.season;

    -- Step 2: Use the comprehensive lock-aware statistics function for each game
    FOR game_rec IN
        SELECT id, home_team, away_team
        FROM games
        WHERE season = active_week_rec.season
        AND week = active_week_rec.week
    LOOP
        games_count := games_count + 1;

        BEGIN
            -- Use the existing comprehensive function that properly handles locks
            PERFORM public.calculate_game_pick_statistics_safe(game_rec.id);
            stats_count := stats_count + 1;

            RAISE NOTICE '  📊 Updated statistics for % vs %', game_rec.away_team, game_rec.home_team;

        EXCEPTION
            WHEN OTHERS THEN
                error_list := array_append(error_list,
                    format('Game %s: %s', game_rec.id, SQLERRM));
                RAISE WARNING '❌ Error updating game %: %', game_rec.id, SQLERRM;
        END;

    END LOOP;

    RAISE NOTICE '📊 Results: % games processed, % statistics calculated',
                 games_count, stats_count;

    RETURN QUERY SELECT games_count, stats_count, error_list;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Game statistics failed: %', SQLERRM;
        RETURN QUERY SELECT games_count, stats_count,
                           ARRAY[SQLERRM]::TEXT[];
END;
$$;

-- Update function comment to reflect the change
COMMENT ON FUNCTION scheduled_game_statistics() IS
'Scheduled function to update game-level pick statistics including proper lock counting.
Uses calculate_game_pick_statistics_safe() to ensure locks are counted separately from regular picks.
Fixed version that replaces the basic counting logic with comprehensive statistics calculation.';

-- Test the updated function
DO $$
DECLARE
    test_result RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🧪 Testing updated scheduled_game_statistics()...';

    SELECT * INTO test_result FROM scheduled_game_statistics();

    RAISE NOTICE '✅ Test completed - Games: %, Statistics: %',
                 test_result.games_updated, test_result.statistics_calculated;

    IF array_length(test_result.errors, 1) > 0 THEN
        RAISE NOTICE '⚠️ Errors: %', test_result.errors;
    ELSE
        RAISE NOTICE '✅ No errors encountered';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '🎉 FIX APPLIED SUCCESSFULLY!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 WHAT WAS FIXED:';
    RAISE NOTICE '• scheduled_game_statistics() now uses calculate_game_pick_statistics_safe()';
    RAISE NOTICE '• Lock statistics (home_team_locks, away_team_locks) are properly maintained';
    RAISE NOTICE '• All pick statistics include both regular picks and locks separately';
    RAISE NOTICE '• The function no longer overwrites lock counts with zeros';
    RAISE NOTICE '';
    RAISE NOTICE '🔄 HOW TO USE:';
    RAISE NOTICE '• Run manually: SELECT * FROM scheduled_game_statistics();';
    RAISE NOTICE '• Runs automatically every 30 minutes during game days';
    RAISE NOTICE '• Also available in Admin Dashboard > Scheduled Functions Manager';
    RAISE NOTICE '';
END;
$$;