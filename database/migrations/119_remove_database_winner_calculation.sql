-- Migration 119: Remove Winner Calculation from Database Function
-- The CFBD Live Updater should handle winner calculation, not the database function

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
    game_updated BOOLEAN;
BEGIN
    RAISE NOTICE '🏈 SCHEDULED LIVE UPDATES: Starting at %', CURRENT_TIMESTAMP;
    
    -- Find active week
    SELECT week, season INTO active_week_rec
    FROM week_settings
    WHERE picks_open = true
    ORDER BY week DESC
    LIMIT 1;
    
    IF NOT FOUND THEN
        RAISE NOTICE '⏳ No active week found';
        RETURN QUERY SELECT 0, 0, 0, ARRAY['No active week found']::TEXT[];
        RETURN;
    END IF;
    
    RAISE NOTICE '🎯 Processing Week % Season %', active_week_rec.week, active_week_rec.season;
    
    -- Process games that need updating
    FOR game_rec IN 
        SELECT id, home_team, away_team, home_score, away_score, status, spread, kickoff_time, 
               winner_against_spread, margin_bonus
        FROM games 
        WHERE season = active_week_rec.season 
        AND week = active_week_rec.week
    LOOP
        checked_count := checked_count + 1;
        game_updated := FALSE;
        
        RAISE NOTICE '  📊 Checking: % @ % (% - %)', 
                    game_rec.away_team, game_rec.home_team, 
                    COALESCE(game_rec.away_score, 0), COALESCE(game_rec.home_score, 0);
        
        -- Determine if game needs status update ONLY
        -- NO WINNER CALCULATION - that's handled by CFBD Live Updater
        DECLARE
            kickoff_time TIMESTAMP WITH TIME ZONE;
            now_time TIMESTAMP WITH TIME ZONE;
            hours_elapsed DECIMAL;
            new_status game_status;
            current_status game_status;
        BEGIN
            kickoff_time := game_rec.kickoff_time;
            now_time := CURRENT_TIMESTAMP;
            hours_elapsed := EXTRACT(EPOCH FROM (now_time - kickoff_time)) / 3600;
            
            current_status := game_rec.status;
            new_status := game_rec.status;  -- Default to current status
            
            RAISE NOTICE '    ⏰ Hours elapsed: %, Current status: %', ROUND(hours_elapsed, 1), current_status;
            
            -- SIMPLIFIED: Only update status based on time, NO winner calculation
            IF current_status = 'in_progress' AND hours_elapsed > 4 THEN
                -- Game in progress for 4+ hours → completed
                new_status := 'completed';
                RAISE NOTICE '    ✅ Game in progress 4+ hours, marking completed';
            ELSIF current_status = 'scheduled' AND hours_elapsed > -0.5 THEN
                -- Game past kickoff time
                IF hours_elapsed > 4 THEN
                    new_status := 'completed';
                    RAISE NOTICE '    ✅ Scheduled game 4+ hours past kickoff, marking completed';
                ELSE
                    new_status := 'in_progress';
                    RAISE NOTICE '    🔴 Scheduled game past kickoff, marking in_progress';
                END IF;
            END IF;
            
            -- Update game status if needed
            IF new_status != current_status THEN
                RAISE NOTICE '    🔄 Status update: % → %', current_status, new_status;
                
                UPDATE games 
                SET status = new_status,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = game_rec.id;
                
                updated_count := updated_count + 1;
                game_updated := TRUE;
                
                IF new_status = 'completed' AND current_status != 'completed' THEN
                    completed_count := completed_count + 1;
                END IF;
            END IF;
            
            -- NO WINNER CALCULATION HERE!
            -- Winner calculation is handled by CFBD Live Updater only
            
            IF NOT game_updated THEN
                RAISE NOTICE '    ✅ No updates needed';
            END IF;
            
        EXCEPTION
            WHEN OTHERS THEN
                error_list := array_append(error_list, 
                    'Error processing ' || game_rec.home_team || ': ' || SQLERRM);
                RAISE NOTICE '    ❌ Error: %', SQLERRM;
        END;
    END LOOP;
    
    RAISE NOTICE '📊 FINAL Results: % checked, % updated, % newly completed', 
                 checked_count, updated_count, completed_count;
    
    RETURN QUERY SELECT checked_count, updated_count, completed_count, error_list;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Live updates failed: %', SQLERRM;
        RETURN QUERY SELECT checked_count, updated_count, completed_count, 
                           ARRAY[SQLERRM]::TEXT[];
END;
$$;

-- Update permissions
GRANT EXECUTE ON FUNCTION scheduled_live_game_updates() TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ REMOVED DATABASE WINNER CALCULATION!';
    RAISE NOTICE '=====================================';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 CHANGES:';
    RAISE NOTICE '• Database function now ONLY updates game status based on time';
    RAISE NOTICE '• NO winner_against_spread calculation in database function';
    RAISE NOTICE '• Winner calculation is now EXCLUSIVELY handled by CFBD Live Updater';
    RAISE NOTICE '• Eliminated the "should_be_completed" logic entirely';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 This prevents premature winner calculations!';
    RAISE NOTICE 'Only the CFBD updater can set winners, and only for completed games.';
END;
$$;