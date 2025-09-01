-- Quick script to process the two problematic games
-- Run this in Supabase SQL Editor after applying Migration 112

DO $$
DECLARE
    vt_sc_game_id UUID;
    nd_miami_game_id UUID;
    result RECORD;
BEGIN
    RAISE NOTICE '🎯 Processing problematic games individually...';
    
    -- Find Virginia Tech @ South Carolina game
    SELECT id INTO vt_sc_game_id
    FROM games 
    WHERE season = 2025 
    AND week = 1
    AND home_team = 'South Carolina' 
    AND away_team = 'Virginia Tech'
    LIMIT 1;
    
    -- Find Notre Dame @ Miami game  
    SELECT id INTO nd_miami_game_id
    FROM games 
    WHERE season = 2025 
    AND week = 1
    AND home_team = 'Miami' 
    AND away_team = 'Notre Dame'
    LIMIT 1;
    
    -- Process Virginia Tech @ South Carolina with small chunks
    IF vt_sc_game_id IS NOT NULL THEN
        RAISE NOTICE '';
        RAISE NOTICE '📋 Processing Virginia Tech @ South Carolina...';
        
        SELECT * INTO result 
        FROM calculate_pick_results_for_game_chunked(vt_sc_game_id, 25); -- Even smaller chunks
        
        IF result.game_processed THEN
            RAISE NOTICE '✅ Success! Updated % picks and % anonymous picks', 
                result.picks_updated, result.anonymous_picks_updated;
        ELSE
            RAISE NOTICE '❌ Failed: %', result.operation_status;
        END IF;
    ELSE
        RAISE NOTICE '⚠️ Virginia Tech @ South Carolina game not found';
    END IF;
    
    -- Process Notre Dame @ Miami with small chunks
    IF nd_miami_game_id IS NOT NULL THEN
        RAISE NOTICE '';
        RAISE NOTICE '📋 Processing Notre Dame @ Miami...';
        
        SELECT * INTO result 
        FROM calculate_pick_results_for_game_chunked(nd_miami_game_id, 25); -- Even smaller chunks
        
        IF result.game_processed THEN
            RAISE NOTICE '✅ Success! Updated % picks and % anonymous picks', 
                result.picks_updated, result.anonymous_picks_updated;
        ELSE
            RAISE NOTICE '❌ Failed: %', result.operation_status;
        END IF;
    ELSE
        RAISE NOTICE '⚠️ Notre Dame @ Miami game not found';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '🏁 Processing complete!';
END;
$$;