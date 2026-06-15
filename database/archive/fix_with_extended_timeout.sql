-- Fix timeouts by temporarily increasing the timeout limit
-- Run this in Supabase SQL Editor

-- Step 1: Check current timeout setting
SHOW statement_timeout;

-- Step 2: Increase timeout to 5 minutes for this session only
SET LOCAL statement_timeout = '300s';

-- Step 3: Now process the problem games with the original function
DO $$
DECLARE
    vt_sc_game_id UUID;
    nd_miami_game_id UUID;
    result RECORD;
BEGIN
    RAISE NOTICE '⏱️ Statement timeout increased to 5 minutes for this session';
    RAISE NOTICE '';
    
    -- Find the games
    SELECT id INTO vt_sc_game_id FROM games 
    WHERE season = 2025 AND week = 1
    AND home_team = 'South Carolina' AND away_team = 'Virginia Tech' LIMIT 1;
    
    SELECT id INTO nd_miami_game_id FROM games 
    WHERE season = 2025 AND week = 1
    AND home_team = 'Miami' AND away_team = 'Notre Dame' LIMIT 1;
    
    -- Process Virginia Tech @ South Carolina
    IF vt_sc_game_id IS NOT NULL THEN
        RAISE NOTICE '📋 Processing Virginia Tech @ South Carolina with extended timeout...';
        
        SELECT * INTO result FROM calculate_pick_results_for_game(vt_sc_game_id);
        
        IF result.game_processed THEN
            RAISE NOTICE '✅ Success! Updated % picks and % anonymous picks', 
                result.picks_updated, result.anonymous_picks_updated;
        ELSE
            RAISE NOTICE '❌ Failed: %', result.operation_status;
        END IF;
    END IF;
    
    -- Process Notre Dame @ Miami
    IF nd_miami_game_id IS NOT NULL THEN
        RAISE NOTICE '';
        RAISE NOTICE '📋 Processing Notre Dame @ Miami with extended timeout...';
        
        SELECT * INTO result FROM calculate_pick_results_for_game(nd_miami_game_id);
        
        IF result.game_processed THEN
            RAISE NOTICE '✅ Success! Updated % picks and % anonymous picks', 
                result.picks_updated, result.anonymous_picks_updated;
        ELSE
            RAISE NOTICE '❌ Failed: %', result.operation_status;
        END IF;
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '🏁 Processing complete!';
END;
$$;

-- Step 4: Reset timeout (happens automatically when session ends, but good practice)
RESET statement_timeout;