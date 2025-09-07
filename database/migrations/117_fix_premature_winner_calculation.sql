-- Migration 117: Fix Premature Winner Calculation
-- Only calculate winner_against_spread when game status is actually 'completed'

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
    home_margin DECIMAL;
    winner_team TEXT;
    bonus_points INTEGER;
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
        
        -- Determine if game needs status update
        DECLARE
            kickoff_time TIMESTAMP WITH TIME ZONE;
            now_time TIMESTAMP WITH TIME ZONE;
            hours_elapsed DECIMAL;
            should_be_completed BOOLEAN := FALSE;
            new_status game_status;
            current_status game_status;
        BEGIN
            kickoff_time := game_rec.kickoff_time;
            now_time := CURRENT_TIMESTAMP;
            hours_elapsed := EXTRACT(EPOCH FROM (now_time - kickoff_time)) / 3600;
            
            -- Set current status (already proper enum from database)
            current_status := game_rec.status;
            new_status := game_rec.status;  -- Default to current status
            
            RAISE NOTICE '    ⏰ Hours elapsed: %, Current status: %', ROUND(hours_elapsed, 1), current_status;
            
            -- Update logic based on time elapsed
            IF current_status = 'completed' THEN
                -- Check if missing winner calculation
                IF game_rec.winner_against_spread IS NULL AND 
                   game_rec.home_score IS NOT NULL AND game_rec.away_score IS NOT NULL THEN
                    should_be_completed := TRUE;
                    RAISE NOTICE '    🎯 Completed game missing winner calculation';
                END IF;
            ELSIF current_status = 'in_progress' AND hours_elapsed > 4 THEN
                -- Game in progress for 4+ hours → completed
                should_be_completed := TRUE;
                new_status := 'completed';
                RAISE NOTICE '    ✅ Game in progress 4+ hours, marking completed';
            ELSIF current_status = 'scheduled' AND hours_elapsed > -0.5 THEN
                -- Game past kickoff time
                IF hours_elapsed > 4 THEN
                    should_be_completed := TRUE;
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
                
                -- Update our local record
                game_rec.status := new_status;
            END IF;
            
            -- FIXED: Calculate winner ONLY for games that are actually completed
            -- Don't calculate for games that "should be" completed but aren't yet marked as such
            IF game_rec.status = 'completed' AND 
               game_rec.winner_against_spread IS NULL AND
               game_rec.home_score IS NOT NULL AND game_rec.away_score IS NOT NULL THEN
               
                RAISE NOTICE '    🎯 Calculating winner against spread...';
                RAISE NOTICE '    📊 Final: % - %, Spread: %', game_rec.away_score, game_rec.home_score, game_rec.spread;
                
                home_margin := game_rec.home_score - game_rec.away_score;
                
                -- Winner calculation
                IF ABS(home_margin + game_rec.spread) < 0.5 THEN
                    winner_team := 'push';
                    bonus_points := 0;
                ELSIF home_margin + game_rec.spread > 0 THEN
                    winner_team := game_rec.home_team;
                    -- Margin bonus for home win
                    IF (home_margin + game_rec.spread) >= 29 THEN 
                        bonus_points := 5;
                    ELSIF (home_margin + game_rec.spread) >= 20 THEN 
                        bonus_points := 3;
                    ELSIF (home_margin + game_rec.spread) >= 11 THEN 
                        bonus_points := 1;
                    ELSE 
                        bonus_points := 0;
                    END IF;
                ELSE
                    winner_team := game_rec.away_team;
                    -- Margin bonus for away win
                    IF ABS(home_margin + game_rec.spread) >= 29 THEN 
                        bonus_points := 5;
                    ELSIF ABS(home_margin + game_rec.spread) >= 20 THEN 
                        bonus_points := 3;
                    ELSIF ABS(home_margin + game_rec.spread) >= 11 THEN 
                        bonus_points := 1;
                    ELSE 
                        bonus_points := 0;
                    END IF;
                END IF;
                
                -- Update with winner calculation
                UPDATE games 
                SET winner_against_spread = winner_team,
                    margin_bonus = bonus_points,
                    base_points = 20,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = game_rec.id;
                
                RAISE NOTICE '    ✅ Winner: %, Margin Bonus: %', winner_team, bonus_points;
                
                IF new_status = 'completed' AND current_status != 'completed' THEN
                    completed_count := completed_count + 1;
                END IF;
                
                updated_count := updated_count + 1;
                game_updated := TRUE;
            END IF;
            
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
    RAISE NOTICE '✅ FIXED PREMATURE WINNER CALCULATION!';
    RAISE NOTICE '=======================================';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 KEY FIX:';
    RAISE NOTICE '• Winner calculation now ONLY happens when status = completed';
    RAISE NOTICE '• Removed premature winner calculation for "should be completed" games';
    RAISE NOTICE '• Games must be explicitly marked as completed before winner calculation';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 This prevents winner_against_spread from being set on incomplete games!';
END;
$$;