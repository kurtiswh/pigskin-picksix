-- Migration 115c: Create Pick Processing Function
-- Simple function to process picks for completed games

CREATE OR REPLACE FUNCTION scheduled_pick_processing()
RETURNS TABLE(
    games_processed INTEGER,
    picks_updated INTEGER,
    anonymous_picks_updated INTEGER,
    errors TEXT[]
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    processed_count INTEGER := 0;
    picks_count INTEGER := 0;
    anon_picks_count INTEGER := 0;
    error_list TEXT[] := ARRAY[]::TEXT[];
    active_week_rec RECORD;
    game_rec RECORD;
    pick_rec RECORD;
    result_value TEXT;
    points_value INTEGER;
    home_margin DECIMAL;
BEGIN
    RAISE NOTICE '🎯 SCHEDULED PICK PROCESSING: Starting at %', CURRENT_TIMESTAMP;
    
    -- Step 1: Find active week
    SELECT week, season INTO active_week_rec
    FROM week_settings
    WHERE picks_open = true
    ORDER BY week DESC
    LIMIT 1;
    
    IF NOT FOUND THEN
        RAISE NOTICE '⏳ No active week found for pick processing';
        RETURN QUERY SELECT 0, 0, 0, ARRAY['No active week found']::TEXT[];
        RETURN;
    END IF;
    
    RAISE NOTICE '🎯 Processing picks for Week % Season %', active_week_rec.week, active_week_rec.season;
    
    -- Step 2: Find completed games that need pick processing
    FOR game_rec IN 
        SELECT id, home_team, away_team, home_score, away_score, spread, winner_against_spread, margin_bonus
        FROM games 
        WHERE season = active_week_rec.season 
        AND week = active_week_rec.week
        AND status = 'completed'
        AND winner_against_spread IS NOT NULL
        AND (
            EXISTS (SELECT 1 FROM picks WHERE game_id = games.id AND result IS NULL)
            OR EXISTS (SELECT 1 FROM anonymous_picks WHERE game_id = games.id AND result IS NULL)
        )
    LOOP
        processed_count := processed_count + 1;
        RAISE NOTICE '  🎯 Processing picks for: % @ % (Winner: %)', 
                     game_rec.away_team, game_rec.home_team, game_rec.winner_against_spread;
        
        -- Step 3: Process regular picks for this game
        FOR pick_rec IN
            SELECT id, selected_team, is_lock
            FROM picks
            WHERE game_id = game_rec.id
            AND result IS NULL
        LOOP
            -- Calculate result
            IF game_rec.winner_against_spread = 'push' THEN
                result_value := 'push';
                points_value := 10;
            ELSIF pick_rec.selected_team = game_rec.winner_against_spread THEN
                result_value := 'win';
                points_value := 20 + COALESCE(game_rec.margin_bonus, 0);
                -- Add lock bonus
                IF pick_rec.is_lock THEN
                    points_value := points_value + COALESCE(game_rec.margin_bonus, 0);
                END IF;
            ELSE
                result_value := 'loss';
                points_value := 0;
            END IF;
            
            -- Update the pick
            UPDATE picks 
            SET result = result_value::pick_result,
                points_earned = points_value,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = pick_rec.id;
            
            picks_count := picks_count + 1;
        END LOOP;
        
        -- Step 4: Process anonymous picks for this game
        FOR pick_rec IN
            SELECT id, selected_team, is_lock
            FROM anonymous_picks
            WHERE game_id = game_rec.id
            AND result IS NULL
        LOOP
            -- Calculate result (same logic as regular picks)
            IF game_rec.winner_against_spread = 'push' THEN
                result_value := 'push';
                points_value := 10;
            ELSIF pick_rec.selected_team = game_rec.winner_against_spread THEN
                result_value := 'win';
                points_value := 20 + COALESCE(game_rec.margin_bonus, 0);
                -- Add lock bonus
                IF pick_rec.is_lock THEN
                    points_value := points_value + COALESCE(game_rec.margin_bonus, 0);
                END IF;
            ELSE
                result_value := 'loss';
                points_value := 0;
            END IF;
            
            -- Update the anonymous pick
            UPDATE anonymous_picks 
            SET result = result_value,
                points_earned = points_value
            WHERE id = pick_rec.id;
            
            anon_picks_count := anon_picks_count + 1;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE '📊 Results: % games processed, % picks updated, % anonymous picks updated', 
                 processed_count, picks_count, anon_picks_count;
    
    RETURN QUERY SELECT processed_count, picks_count, anon_picks_count, error_list;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Pick processing failed: %', SQLERRM;
        RETURN QUERY SELECT processed_count, picks_count, anon_picks_count, 
                           ARRAY[SQLERRM]::TEXT[];
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION scheduled_pick_processing() TO authenticated;

-- Test the function
DO $$
DECLARE
    test_result RECORD;
BEGIN
    RAISE NOTICE '🧪 Testing scheduled_pick_processing()...';
    
    SELECT * INTO test_result FROM scheduled_pick_processing();
    
    RAISE NOTICE '✅ Test completed - Games: %, Picks: %, Anonymous: %', 
                 test_result.games_processed, test_result.picks_updated, test_result.anonymous_picks_updated;
                 
    IF array_length(test_result.errors, 1) > 0 THEN
        RAISE NOTICE '⚠️ Errors: %', test_result.errors;
    END IF;
END;
$$;