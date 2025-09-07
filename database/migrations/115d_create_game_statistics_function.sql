-- Migration 115d: Create Game Statistics Function
-- Simple function to update game-level pick statistics (no winner calculation)

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
    home_pick_count INTEGER;
    away_pick_count INTEGER;
    total_pick_count INTEGER;
    home_percentage DECIMAL;
    away_percentage DECIMAL;
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
    
    -- Step 2: Update statistics for each game
    FOR game_rec IN 
        SELECT id, home_team, away_team
        FROM games 
        WHERE season = active_week_rec.season 
        AND week = active_week_rec.week
    LOOP
        games_count := games_count + 1;
        
        -- Count picks for home team (from both regular and anonymous picks)
        SELECT 
            COALESCE(SUM(CASE WHEN selected_team = game_rec.home_team THEN 1 ELSE 0 END), 0)
        INTO home_pick_count
        FROM (
            SELECT selected_team FROM picks WHERE game_id = game_rec.id AND submitted = true
            UNION ALL
            SELECT selected_team FROM anonymous_picks WHERE game_id = game_rec.id
        ) combined_picks;
        
        -- Count picks for away team (from both regular and anonymous picks)
        SELECT 
            COALESCE(SUM(CASE WHEN selected_team = game_rec.away_team THEN 1 ELSE 0 END), 0)
        INTO away_pick_count
        FROM (
            SELECT selected_team FROM picks WHERE game_id = game_rec.id AND submitted = true
            UNION ALL
            SELECT selected_team FROM anonymous_picks WHERE game_id = game_rec.id
        ) combined_picks;
        
        total_pick_count := home_pick_count + away_pick_count;
        
        -- Calculate percentages (avoid division by zero)
        IF total_pick_count > 0 THEN
            home_percentage := (home_pick_count::DECIMAL / total_pick_count::DECIMAL * 100);
            away_percentage := (away_pick_count::DECIMAL / total_pick_count::DECIMAL * 100);
        ELSE
            home_percentage := 0;
            away_percentage := 0;
        END IF;
        
        -- Update game statistics (create columns if they don't exist)
        BEGIN
            UPDATE games 
            SET 
                home_team_picks = home_pick_count,
                away_team_picks = away_pick_count,
                total_picks = total_pick_count,
                home_pick_percentage = home_percentage,
                away_pick_percentage = away_percentage,
                pick_stats_updated_at = CURRENT_TIMESTAMP
            WHERE id = game_rec.id;
            
            stats_count := stats_count + 1;
            
        EXCEPTION 
            WHEN undefined_column THEN
                -- Columns don't exist, add them
                RAISE NOTICE '  📝 Adding statistics columns to games table...';
                ALTER TABLE games ADD COLUMN IF NOT EXISTS home_team_picks INTEGER DEFAULT 0;
                ALTER TABLE games ADD COLUMN IF NOT EXISTS away_team_picks INTEGER DEFAULT 0;
                ALTER TABLE games ADD COLUMN IF NOT EXISTS total_picks INTEGER DEFAULT 0;
                ALTER TABLE games ADD COLUMN IF NOT EXISTS home_pick_percentage DECIMAL(5,2) DEFAULT 0;
                ALTER TABLE games ADD COLUMN IF NOT EXISTS away_pick_percentage DECIMAL(5,2) DEFAULT 0;
                ALTER TABLE games ADD COLUMN IF NOT EXISTS pick_stats_updated_at TIMESTAMP WITH TIME ZONE;
                
                -- Retry the update
                UPDATE games 
                SET 
                    home_team_picks = home_pick_count,
                    away_team_picks = away_pick_count,
                    total_picks = total_pick_count,
                    home_pick_percentage = home_percentage,
                    away_pick_percentage = away_percentage,
                    pick_stats_updated_at = CURRENT_TIMESTAMP
                WHERE id = game_rec.id;
                
                stats_count := stats_count + 1;
        END;
        
        RAISE NOTICE '  📊 %: % picks home (%.1f%%), % picks away (%.1f%%), % total', 
                     game_rec.home_team, home_pick_count, home_percentage,
                     away_pick_count, away_percentage, total_pick_count;
    END LOOP;
    
    RAISE NOTICE '📊 Results: % games updated, % statistics calculated', 
                 games_count, stats_count;
    
    RETURN QUERY SELECT games_count, stats_count, error_list;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Game statistics failed: %', SQLERRM;
        RETURN QUERY SELECT games_count, stats_count, 
                           ARRAY[SQLERRM]::TEXT[];
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION scheduled_game_statistics() TO authenticated;

-- Test the function
DO $$
DECLARE
    test_result RECORD;
BEGIN
    RAISE NOTICE '🧪 Testing scheduled_game_statistics()...';
    
    SELECT * INTO test_result FROM scheduled_game_statistics();
    
    RAISE NOTICE '✅ Test completed - Games: %, Statistics: %', 
                 test_result.games_updated, test_result.statistics_calculated;
                 
    IF array_length(test_result.errors, 1) > 0 THEN
        RAISE NOTICE '⚠️ Errors: %', test_result.errors;
    END IF;
END;
$$;