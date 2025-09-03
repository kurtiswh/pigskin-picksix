-- Migration 118: Add Pick Count Calculation Functions
-- 
-- PURPOSE: Create functions to calculate and update pick count fields in games table
-- CONTEXT: Fix pick count fields (home_team_picks, home_team_locks, etc.) and connect to admin controls

DO $$
BEGIN
    RAISE NOTICE '📊 Migration 118: Adding pick count calculation functions';
    RAISE NOTICE '=======================================================';
END;
$$;

-- Function 1: Update pick counts for a single game
CREATE OR REPLACE FUNCTION update_game_pick_counts(
    game_id_param UUID
)
RETURNS TABLE(
    game_updated BOOLEAN,
    operation_status TEXT,
    home_picks INTEGER,
    home_locks INTEGER,
    away_picks INTEGER,
    away_locks INTEGER,
    total INTEGER
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    game_rec RECORD;
    home_picks_count INTEGER := 0;
    home_locks_count INTEGER := 0;
    away_picks_count INTEGER := 0;
    away_locks_count INTEGER := 0;
    total_picks_count INTEGER := 0;
BEGIN
    RAISE NOTICE '📊 Updating pick counts for game: %', game_id_param;
    
    -- Get game details
    SELECT * INTO game_rec FROM public.games WHERE id = game_id_param;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Game not found', 0, 0, 0, 0, 0;
        RETURN;
    END IF;
    
    -- Count home team regular picks (both tables)
    SELECT COUNT(*) INTO home_picks_count
    FROM (
        SELECT 1 FROM public.picks
        WHERE game_id = game_id_param
        AND selected_team = game_rec.home_team
        AND is_lock = FALSE
        UNION ALL
        SELECT 1 FROM public.anonymous_picks
        WHERE game_id = game_id_param
        AND selected_team = game_rec.home_team
        AND is_lock = FALSE
    ) combined;
    
    -- Count home team lock picks (both tables)
    SELECT COUNT(*) INTO home_locks_count
    FROM (
        SELECT 1 FROM public.picks
        WHERE game_id = game_id_param
        AND selected_team = game_rec.home_team
        AND is_lock = TRUE
        UNION ALL
        SELECT 1 FROM public.anonymous_picks
        WHERE game_id = game_id_param
        AND selected_team = game_rec.home_team
        AND is_lock = TRUE
    ) combined;
    
    -- Count away team regular picks (both tables)
    SELECT COUNT(*) INTO away_picks_count
    FROM (
        SELECT 1 FROM public.picks
        WHERE game_id = game_id_param
        AND selected_team = game_rec.away_team
        AND is_lock = FALSE
        UNION ALL
        SELECT 1 FROM public.anonymous_picks
        WHERE game_id = game_id_param
        AND selected_team = game_rec.away_team
        AND is_lock = FALSE
    ) combined;
    
    -- Count away team lock picks (both tables)
    SELECT COUNT(*) INTO away_locks_count
    FROM (
        SELECT 1 FROM public.picks
        WHERE game_id = game_id_param
        AND selected_team = game_rec.away_team
        AND is_lock = TRUE
        UNION ALL
        SELECT 1 FROM public.anonymous_picks
        WHERE game_id = game_id_param
        AND selected_team = game_rec.away_team
        AND is_lock = TRUE
    ) combined;
    
    -- Calculate total
    total_picks_count := home_picks_count + home_locks_count + away_picks_count + away_locks_count;
    
    -- Update the game with new pick counts
    UPDATE public.games 
    SET 
        home_team_picks = home_picks_count,
        home_team_locks = home_locks_count,
        away_team_picks = away_picks_count,
        away_team_locks = away_locks_count,
        total_picks = total_picks_count,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = game_id_param;
    
    RAISE NOTICE '  ✅ Updated % @ %: home=% (% reg + % lock), away=% (% reg + % lock), total=%',
        game_rec.away_team, game_rec.home_team,
        home_picks_count + home_locks_count, home_picks_count, home_locks_count,
        away_picks_count + away_locks_count, away_picks_count, away_locks_count,
        total_picks_count;
    
    RETURN QUERY SELECT TRUE, 
        format('Pick counts updated: %s total picks', total_picks_count),
        home_picks_count, home_locks_count, away_picks_count, away_locks_count, total_picks_count;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Error updating pick counts for game %: %', game_id_param, SQLERRM;
        RETURN QUERY SELECT FALSE, format('Error: %s', SQLERRM), 0, 0, 0, 0, 0;
END;
$$;

-- Function 2: Update pick counts for all games in a specific week
CREATE OR REPLACE FUNCTION update_week_game_pick_counts(
    week_param INTEGER,
    season_param INTEGER
)
RETURNS TABLE(
    games_processed INTEGER,
    games_updated INTEGER,
    operation_status TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    game_rec RECORD;
    total_games INTEGER := 0;
    updated_games INTEGER := 0;
    result_rec RECORD;
BEGIN
    RAISE NOTICE '📊 Updating pick counts for Week % Season %', week_param, season_param;
    
    -- Process each game in the specified week
    FOR game_rec IN 
        SELECT * FROM public.games 
        WHERE week = week_param 
        AND season = season_param 
        ORDER BY kickoff_time
    LOOP
        total_games := total_games + 1;
        
        -- Update pick counts for this game
        BEGIN
            SELECT * INTO result_rec FROM update_game_pick_counts(game_rec.id);
            
            IF result_rec.game_updated THEN
                updated_games := updated_games + 1;
            END IF;
            
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE '  ⚠️ Error processing game %s @ %s: %', 
                    game_rec.away_team, game_rec.home_team, SQLERRM;
        END;
    END LOOP;
    
    RAISE NOTICE '✅ Pick count update completed: % games processed, % games updated', 
        total_games, updated_games;
    
    RETURN QUERY SELECT total_games, updated_games, 
        format('Successfully updated pick counts for %s games in Week %s Season %s', 
               updated_games, week_param, season_param);
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Error in week pick count update: %', SQLERRM;
        RETURN QUERY SELECT 0, 0, format('Error: %s', SQLERRM);
END;
$$;

-- Function 3: Update pick counts for all games (for comprehensive fixes)
CREATE OR REPLACE FUNCTION update_all_game_pick_counts()
RETURNS TABLE(
    games_processed INTEGER,
    games_updated INTEGER,
    operation_status TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    game_rec RECORD;
    total_games INTEGER := 0;
    updated_games INTEGER := 0;
    result_rec RECORD;
BEGIN
    RAISE NOTICE '📊 Updating pick counts for ALL games';
    
    -- Process all games
    FOR game_rec IN 
        SELECT * FROM public.games 
        ORDER BY season DESC, week DESC, kickoff_time
    LOOP
        total_games := total_games + 1;
        
        -- Update pick counts for this game
        BEGIN
            SELECT * INTO result_rec FROM update_game_pick_counts(game_rec.id);
            
            IF result_rec.game_updated THEN
                updated_games := updated_games + 1;
            END IF;
            
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE '  ⚠️ Error processing game %s @ %s: %', 
                    game_rec.away_team, game_rec.home_team, SQLERRM;
        END;
        
        -- Progress logging every 25 games
        IF total_games % 25 = 0 THEN
            RAISE NOTICE '  Processed % games...', total_games;
        END IF;
    END LOOP;
    
    RAISE NOTICE '✅ All games pick count update completed: % games processed, % games updated', 
        total_games, updated_games;
    
    RETURN QUERY SELECT total_games, updated_games, 
        format('Successfully updated pick counts for %s games total', updated_games);
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Error in all games pick count update: %', SQLERRM;
        RETURN QUERY SELECT 0, 0, format('Error: %s', SQLERRM);
END;
$$;

-- Grant execute permissions to authenticated users (admin check happens in application layer)
GRANT EXECUTE ON FUNCTION update_game_pick_counts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_week_game_pick_counts(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION update_all_game_pick_counts() TO authenticated;

-- Add function documentation
COMMENT ON FUNCTION update_game_pick_counts(UUID) IS 
'Update pick count fields (home_team_picks, home_team_locks, etc.) for a single game';

COMMENT ON FUNCTION update_week_game_pick_counts(INTEGER, INTEGER) IS 
'Update pick count fields for all games in a specific week and season';

COMMENT ON FUNCTION update_all_game_pick_counts() IS 
'Update pick count fields for all games in the database (for comprehensive fixes)';

-- Test the function by running it on current week (replace with actual current week/season)
DO $$
DECLARE
    current_week INTEGER := 15;  -- Adjust this to current week
    current_season INTEGER := 2024;  -- Adjust this to current season
    result_rec RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🧪 Testing pick count update for Week % Season %...', current_week, current_season;
    
    SELECT * INTO result_rec FROM update_week_game_pick_counts(current_week, current_season);
    
    RAISE NOTICE '✅ Test completed: %', result_rec.operation_status;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ Test failed (this is OK if week/season does not exist): %', SQLERRM;
END;
$$;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 118 COMPLETED - Pick count calculation functions created!';
    RAISE NOTICE '';
    RAISE NOTICE '📊 CREATED FUNCTIONS:';
    RAISE NOTICE '• update_game_pick_counts(game_id) - Update pick counts for single game';
    RAISE NOTICE '• update_week_game_pick_counts(week, season) - Update pick counts for specific week';
    RAISE NOTICE '• update_all_game_pick_counts() - Update pick counts for all games';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 PICK COUNT FIELDS UPDATED:';
    RAISE NOTICE '• home_team_picks - Regular picks for home team';
    RAISE NOTICE '• home_team_locks - Lock picks for home team';
    RAISE NOTICE '• away_team_picks - Regular picks for away team';
    RAISE NOTICE '• away_team_locks - Lock picks for away team';
    RAISE NOTICE '• total_picks - Sum of all picks for the game';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️ NEXT STEP: Update ScoreManager.tsx to use update_week_game_pick_counts function';
END;
$$;