-- Migration 120: Remove Time-Based Game Completion
-- Games should ONLY be marked complete by API with actual scores, never by time alone

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
    
    -- Process games that need status updates ONLY
    FOR game_rec IN 
        SELECT id, home_team, away_team, home_score, away_score, status, kickoff_time
        FROM games 
        WHERE season = active_week_rec.season 
        AND week = active_week_rec.week
        AND status = 'scheduled' -- Only look at scheduled games
    LOOP
        checked_count := checked_count + 1;
        
        RAISE NOTICE '  📊 Checking: % @ % (status: %)', 
                    game_rec.away_team, game_rec.home_team, game_rec.status;
        
        DECLARE
            kickoff_time TIMESTAMP WITH TIME ZONE;
            now_time TIMESTAMP WITH TIME ZONE;
            hours_elapsed DECIMAL;
            new_status game_status;
        BEGIN
            kickoff_time := game_rec.kickoff_time;
            now_time := CURRENT_TIMESTAMP;
            hours_elapsed := EXTRACT(EPOCH FROM (now_time - kickoff_time)) / 3600;
            
            RAISE NOTICE '    ⏰ Hours elapsed: %', ROUND(hours_elapsed, 1);
            
            -- ONLY update scheduled → in_progress if game has started
            -- NEVER mark as completed based on time alone!
            IF game_rec.status = 'scheduled' AND hours_elapsed > 0 THEN
                -- Game past kickoff time, mark as in_progress
                RAISE NOTICE '    🔴 Scheduled game past kickoff, marking in_progress';
                
                UPDATE games 
                SET status = 'in_progress',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = game_rec.id;
                
                updated_count := updated_count + 1;
            ELSE
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
    RAISE NOTICE '✅ REMOVED TIME-BASED GAME COMPLETION!';
    RAISE NOTICE '=====================================';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 CHANGES:';
    RAISE NOTICE '• Database function now ONLY updates scheduled → in_progress';
    RAISE NOTICE '• NEVER marks games as completed based on time';
    RAISE NOTICE '• Games can ONLY be marked complete by API with actual scores';
    RAISE NOTICE '• Eliminates games being marked complete with wrong/missing scores';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 Only CFBD Live Updater can mark games complete!';
END;
$$;